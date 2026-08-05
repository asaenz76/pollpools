-- ============================================================================
-- 0027_billing_functions.sql  (Phase 7)
-- Server-side checkout creation, webhook event application (the ONLY path that
-- grants entitlements or records earnings), and manual creator payouts.
-- Everything is idempotent and never trusts client-supplied prices/ids.
-- ============================================================================

-- ── Revenue split: effective rule, else tenant default ───────────────────────
create or replace function app.resolve_revenue_split(p_tenant uuid, p_creator uuid, p_type billing_product_type)
returns table (creator_bps int, platform_bps int)
language sql stable security definer set search_path = public as $$
  select coalesce(r.creator_share_basis_points, s.creator_share_bps, 8000),
         coalesce(r.platform_share_basis_points, s.platform_share_bps, 2000)
  from (select 1) one
  left join lateral (
    select creator_share_basis_points, platform_share_basis_points
    from creator_revenue_rules rr
    where rr.tenant_id = p_tenant and rr.creator_id = p_creator and rr.product_type = p_type
      and rr.effective_from <= now() and (rr.effective_to is null or rr.effective_to > now())
    order by rr.effective_from desc limit 1
  ) r on true
  left join tenant_settings s on s.tenant_id = p_tenant;
$$;

-- ── Entitlement grant / revoke (idempotent) ──────────────────────────────────
create or replace function app.grant_entitlement(
  p_tenant uuid, p_user uuid, p_type billing_entitlement_type, p_source_type entitlement_source_type,
  p_source_id uuid, p_creator uuid, p_competition uuid, p_ends_at timestamptz
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into billing_entitlements (tenant_id, user_id, entitlement_type, source_type, source_id, creator_id, competition_id, status, starts_at, ends_at)
  values (p_tenant, p_user, p_type, p_source_type, p_source_id, p_creator, p_competition, 'active', now(), p_ends_at)
  on conflict (tenant_id, user_id, entitlement_type, source_type, source_id) do update
    set status = 'active', ends_at = excluded.ends_at, revoked_at = null;
end; $$;

create or replace function app.revoke_entitlements_for_source(p_source_type entitlement_source_type, p_source_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update billing_entitlements set status = 'revoked', revoked_at = now()
  where source_type = p_source_type and source_id = p_source_id and status = 'active';
end; $$;

-- ── Create a pending checkout (server-side price/eligibility) ────────────────
create or replace function public.create_billing_checkout(
  p_billing_product_id uuid, p_idempotency_key text, p_creator_id uuid, p_competition_id uuid, p_draft_reservation_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_prod billing_products%rowtype;
  v_tenant uuid;
  v_checkout_id uuid;
  v_prior jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select response into v_prior from idempotency_records where scope = 'checkout' and idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  select * into v_prod from billing_products where id = p_billing_product_id;
  if not found or v_prod.status <> 'active' then raise exception 'PRODUCT_UNAVAILABLE' using errcode = '22000'; end if;
  v_tenant := v_prod.tenant_id;
  if v_tenant is null then raise exception 'PRODUCT_TENANT_REQUIRED' using errcode = '22000'; end if;

  -- Tenant + membership cross-check (spec §15).
  if not exists (select 1 from tenant_memberships m where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active') then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  -- Product-shape cross-checks: client-supplied creator/competition must match.
  if v_prod.product_type = 'creator_support' and (p_creator_id is distinct from v_prod.creator_id) then
    raise exception 'CREATOR_MISMATCH' using errcode = '22000';
  end if;
  if v_prod.product_type = 'paid_competitor_draft' and (p_competition_id is distinct from v_prod.competition_id) then
    raise exception 'COMPETITION_MISMATCH' using errcode = '22000';
  end if;

  insert into billing_checkouts (tenant_id, user_id, billing_product_id, provider, status, idempotency_key, metadata)
  values (v_tenant, v_user, v_prod.id, v_prod.provider, 'pending', p_idempotency_key,
    jsonb_strip_nulls(jsonb_build_object('creator_id', p_creator_id, 'competition_id', p_competition_id, 'draft_reservation_id', p_draft_reservation_id)))
  returning id into v_checkout_id;

  return jsonb_build_object(
    'checkout_id', v_checkout_id, 'provider', v_prod.provider, 'provider_variant_id', v_prod.provider_variant_id,
    'amount_minor_units', v_prod.price_minor_units, 'currency_code', v_prod.currency_code,
    'custom_data', jsonb_strip_nulls(jsonb_build_object(
      'tenant_id', v_tenant, 'user_id', v_user, 'internal_billing_product_id', v_prod.id,
      'checkout_id', v_checkout_id, 'creator_id', p_creator_id, 'competition_id', p_competition_id,
      'draft_reservation_id', p_draft_reservation_id)));
end; $$;

-- Attach the provider's hosted-checkout URL once created.
create or replace function public.set_billing_checkout_url(p_checkout_id uuid, p_provider_checkout_id text, p_url text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  update billing_checkouts set provider_checkout_id = p_provider_checkout_id, checkout_url = p_url, status = 'open', expires_at = p_expires_at
    where id = p_checkout_id;
  insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
    select tenant_id, 'checkout', idempotency_key, jsonb_build_object('checkout_id', id, 'checkout_url', p_url), 'completed'
    from billing_checkouts where id = p_checkout_id
    on conflict (scope, idempotency_key) do nothing;
end; $$;

-- ── Apply a verified, normalized billing webhook event (the only grant path) ─
create or replace function public.apply_billing_event(p_webhook_id uuid, p_event jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_type text := p_event->>'type';
  v_custom jsonb := coalesce(p_event->'customData', '{}'::jsonb);
  v_tenant uuid := nullif(v_custom->>'tenant_id', '')::uuid;
  v_user uuid := nullif(v_custom->>'user_id', '')::uuid;
  v_product_id uuid := nullif(v_custom->>'internal_billing_product_id', '')::uuid;
  v_checkout_id uuid := nullif(v_custom->>'checkout_id', '')::uuid;
  v_prod billing_products%rowtype;
  v_order jsonb := p_event->'order';
  v_sub jsonb := p_event->'subscription';
  v_order_id uuid; v_sub_id uuid;
  v_provider billing_provider_type;
  v_ent billing_entitlement_type;
  v_split record;
  v_gross int; v_total int; v_tax int; v_net int; v_cshare int; v_pshare int;
  v_ends timestamptz;
  v_status subscription_status;
  e record;
begin
  if v_product_id is null then return; end if;   -- not our product
  select * into v_prod from billing_products where id = v_product_id;
  if not found then return; end if;
  -- Cross-tenant guard: product tenant must match the custom-data tenant.
  if v_prod.tenant_id is distinct from v_tenant then
    raise exception 'CROSS_TENANT_EVENT' using errcode = '42501';
  end if;
  v_provider := v_prod.provider;

  v_ent := case v_prod.product_type
    when 'platform_premium' then 'platform_premium'::billing_entitlement_type
    when 'creator_support' then 'creator_supporter'::billing_entitlement_type
    else 'paid_draft_access'::billing_entitlement_type end;

  -- ── Orders (one-time + subscription invoices) ──────────────────────────────
  if v_order is not null then
    insert into billing_orders (tenant_id, user_id, billing_product_id, billing_checkout_id, provider, provider_order_id,
      provider_customer_id, status, subtotal_minor_units, tax_minor_units, total_minor_units, currency_code, refunded_minor_units, purchased_at)
    values (v_tenant, v_user, v_prod.id, v_checkout_id, v_provider, v_order->>'providerOrderId',
      v_order->>'providerCustomerId', (v_order->>'status')::billing_order_status,
      coalesce((v_order#>>'{subtotal,amountMinorUnits}')::int, 0), coalesce((v_order#>>'{tax,amountMinorUnits}')::int, 0),
      coalesce((v_order#>>'{total,amountMinorUnits}')::int, 0), coalesce(v_order#>>'{total,currencyCode}', v_prod.currency_code),
      coalesce((v_order#>>'{refunded,amountMinorUnits}')::int, 0), coalesce((v_order->>'purchasedAt')::timestamptz, now()))
    on conflict (provider, provider_order_id) do update
      set status = excluded.status, refunded_minor_units = excluded.refunded_minor_units
    returning id into v_order_id;

    update billing_checkouts set status = 'completed', completed_at = now() where id = v_checkout_id;

    if v_type = 'order_created' then
      -- Paid draft: confirm the reservation + grant access entitlement.
      if v_prod.product_type = 'paid_competitor_draft' then
        perform app.grant_entitlement(v_tenant, v_user, v_ent, 'order', v_order_id, v_prod.creator_id, v_prod.competition_id, null);
        if nullif(v_custom->>'draft_reservation_id', '') is not null then
          update competitor_draft_assignments set status = 'confirmed', payment_status = 'paid', confirmed_at = now(), reservation_expires_at = null
            where id = (v_custom->>'draft_reservation_id')::uuid and status = 'pending_payment';
        end if;
      end if;

      -- Creator earning for creator-support payments (immutable, idempotent).
      if v_prod.product_type = 'creator_support' and v_prod.creator_id is not null then
        v_gross := coalesce((v_order#>>'{total,amountMinorUnits}')::int, 0);
        v_tax := coalesce((v_order#>>'{tax,amountMinorUnits}')::int, 0);
        v_net := greatest(v_gross - v_tax, 0);
        select * into v_split from app.resolve_revenue_split(v_tenant, v_prod.creator_id, 'creator_support');
        v_cshare := (v_net * v_split.creator_bps) / 10000;
        v_pshare := v_net - v_cshare;
        insert into creator_earnings (tenant_id, creator_id, billing_order_id, earning_type, gross_minor_units, tax_minor_units,
          net_revenue_minor_units, creator_share_minor_units, platform_share_minor_units, currency_code, status, idempotency_key)
        values (v_tenant, v_prod.creator_id, v_order_id, 'support_subscription', v_gross, v_tax, v_net, v_cshare, v_pshare,
          coalesce(v_order#>>'{total,currencyCode}', v_prod.currency_code), 'available', 'earn:' || v_order_id::text)
        on conflict (idempotency_key) do nothing;
        update creator_earnings set available_at = now() where idempotency_key = 'earn:' || v_order_id::text and available_at is null;
      end if;
    end if;

    -- ── Refund: compensating reversal + revoke ───────────────────────────────
    if v_type = 'order_refunded' then
      insert into billing_refunds (tenant_id, billing_order_id, provider, amount_minor_units, currency_code, status, idempotency_key)
      values (v_tenant, v_order_id, v_provider, coalesce((p_event#>>'{refund,amount,amountMinorUnits}')::int, 0),
        coalesce(p_event#>>'{refund,amount,currencyCode}', v_prod.currency_code), 'succeeded', 'refund:' || v_order_id::text)
      on conflict (idempotency_key) do nothing;
      update billing_orders set status = 'refunded' where id = v_order_id;
      perform app.revoke_entitlements_for_source('order', v_order_id);

      -- Reverse creator earnings with a compensating negative row (never delete).
      for e in select * from creator_earnings where billing_order_id = v_order_id and status <> 'reversed' and earning_type <> 'reversal' loop
        insert into creator_earnings (tenant_id, creator_id, billing_order_id, earning_type, gross_minor_units, tax_minor_units,
          net_revenue_minor_units, creator_share_minor_units, platform_share_minor_units, currency_code, status, idempotency_key)
        values (e.tenant_id, e.creator_id, e.billing_order_id, 'reversal', -e.gross_minor_units, -e.tax_minor_units,
          -e.net_revenue_minor_units, -e.creator_share_minor_units, -e.platform_share_minor_units, e.currency_code, 'reversed', 'reversal:' || e.id::text)
        on conflict (idempotency_key) do nothing;
        update creator_earnings set status = 'reversed', reversed_by_id = (select id from creator_earnings where idempotency_key = 'reversal:' || e.id::text)
          where id = e.id and status <> 'reversed';
      end loop;
    end if;
  end if;

  -- ── Subscriptions ──────────────────────────────────────────────────────────
  if v_sub is not null then
    v_status := (v_sub->>'status')::subscription_status;
    v_ends := nullif(v_sub->>'currentPeriodEnd', '')::timestamptz;
    insert into billing_subscriptions (tenant_id, user_id, billing_product_id, creator_id, provider, provider_subscription_id,
      provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, trial_ends_at)
    values (v_tenant, v_user, v_prod.id, v_prod.creator_id, v_provider, v_sub->>'providerSubscriptionId',
      v_sub->>'providerCustomerId', v_status, nullif(v_sub->>'currentPeriodStart','')::timestamptz, v_ends,
      coalesce((v_sub->>'cancelAtPeriodEnd')::boolean, false), nullif(v_sub->>'canceledAt','')::timestamptz,
      nullif(v_sub->>'endedAt','')::timestamptz, nullif(v_sub->>'trialEndsAt','')::timestamptz)
    on conflict (provider, provider_subscription_id) do update set
      status = excluded.status, current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at, ended_at = excluded.ended_at
    returning id into v_sub_id;

    if v_status in ('trialing', 'active', 'past_due') then
      perform app.grant_entitlement(v_tenant, v_user, v_ent, 'subscription', v_sub_id, v_prod.creator_id, null, v_ends);
    elsif v_type = 'subscription_expired' or (v_status = 'canceled' and not coalesce((v_sub->>'cancelAtPeriodEnd')::boolean, false)) then
      perform app.revoke_entitlements_for_source('subscription', v_sub_id);
    end if;
  end if;

  perform app.write_audit('billing.event', 'billing_webhook', p_webhook_id, v_tenant, v_user, v_type, v_custom);
end; $$;

-- ── Manual creator payouts ───────────────────────────────────────────────────
create or replace function public.approve_creator_payout(p_payout_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req creator_payout_requests%rowtype; v_avail int; e record; v_alloc int := 0;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_req from creator_payout_requests where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_req.status not in ('requested', 'under_review') then raise exception 'BAD_STATE' using errcode = '22000'; end if;

  -- Reserve available, unallocated earnings up to the requested amount.
  for e in
    select ce.* from creator_earnings ce
    where ce.tenant_id = v_req.tenant_id and ce.creator_id = v_req.creator_id and ce.status = 'available'
      and ce.creator_share_minor_units > 0
      and not exists (select 1 from creator_payout_allocations a where a.earning_id = ce.id)
    order by ce.created_at
  loop
    exit when v_alloc >= v_req.amount_minor_units;
    insert into creator_payout_allocations (tenant_id, payout_request_id, earning_id, amount_minor_units)
    values (v_req.tenant_id, p_payout_id, e.id, e.creator_share_minor_units);
    update creator_earnings set status = 'held' where id = e.id;
    v_alloc := v_alloc + e.creator_share_minor_units;
  end loop;

  if v_alloc < v_req.amount_minor_units then
    -- Not enough available earnings: release and reject.
    delete from creator_payout_allocations where payout_request_id = p_payout_id;
    update creator_earnings set status = 'available' where id in (select earning_id from creator_payout_allocations where payout_request_id = p_payout_id);
    update creator_payout_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), notes = 'Insufficient available earnings' where id = p_payout_id;
    raise exception 'INSUFFICIENT_EARNINGS' using errcode = '22000';
  end if;

  update creator_payout_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_payout_id;
  perform app.write_audit('payout.approve', 'creator_payout', p_payout_id, v_req.tenant_id, auth.uid(), 'Approved', jsonb_build_object('allocated', v_alloc));
  return jsonb_build_object('payout_id', p_payout_id, 'allocated_minor_units', v_alloc);
end; $$;

create or replace function public.mark_creator_payout_paid(p_payout_id uuid, p_external_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare v_req creator_payout_requests%rowtype;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_req from creator_payout_requests where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_req.status <> 'approved' then raise exception 'NOT_APPROVED' using errcode = '22000'; end if;

  update creator_earnings set status = 'paid'
    where id in (select earning_id from creator_payout_allocations where payout_request_id = p_payout_id);
  update creator_payout_requests set status = 'paid', paid_at = now(), external_reference = p_external_reference where id = p_payout_id;
  perform app.write_audit('payout.paid', 'creator_payout', p_payout_id, v_req.tenant_id, auth.uid(), 'Marked paid', jsonb_build_object('ref', p_external_reference));
end; $$;

create or replace function public.reject_creator_payout(p_payout_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_req creator_payout_requests%rowtype;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_req from creator_payout_requests where id = p_payout_id for update;
  if not found then raise exception 'PAYOUT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_req.status = 'paid' then raise exception 'ALREADY_PAID' using errcode = '22000'; end if;
  -- Release any reserved earnings.
  update creator_earnings set status = 'available'
    where id in (select earning_id from creator_payout_allocations where payout_request_id = p_payout_id);
  delete from creator_payout_allocations where payout_request_id = p_payout_id;
  update creator_payout_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), notes = p_reason where id = p_payout_id;
end; $$;

-- Grants: checkout for members; event application + payouts for admin/service only.
revoke all on function public.create_billing_checkout(uuid, text, uuid, uuid, uuid) from public;
grant execute on function public.create_billing_checkout(uuid, text, uuid, uuid, uuid) to authenticated, service_role;
revoke all on function public.set_billing_checkout_url(uuid, text, text, timestamptz) from public;
grant execute on function public.set_billing_checkout_url(uuid, text, text, timestamptz) to authenticated, service_role;
revoke all on function public.apply_billing_event(uuid, jsonb) from public;
grant execute on function public.apply_billing_event(uuid, jsonb) to service_role;
revoke all on function public.approve_creator_payout(uuid) from public;
grant execute on function public.approve_creator_payout(uuid) to authenticated, service_role;
revoke all on function public.mark_creator_payout_paid(uuid, text) from public;
grant execute on function public.mark_creator_payout_paid(uuid, text) to authenticated, service_role;
revoke all on function public.reject_creator_payout(uuid, text) from public;
grant execute on function public.reject_creator_payout(uuid, text) to authenticated, service_role;
