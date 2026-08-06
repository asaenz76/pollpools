-- ============================================================================
-- 0030 — Phase 7.5 §2: recurring creator-support earnings (finding F-12).
--
-- Earnings were recorded only on `order_created`, so the FIRST payment of a
-- monthly/yearly creator_support subscription generated a creator earning but
-- renewals did not. Lemon Squeezy delivers renewals as `subscription_payment_
-- success` (a subscription-invoice), which the adapter now normalizes into an
-- order. This rewrites apply_billing_event so the creator earning is recorded on
-- the initial purchase AND every renewal/recovery invoice, idempotently keyed by
-- the invoice's order id. Paid-draft confirmation stays on order_created only.
-- ============================================================================

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

  -- ── Orders (one-time purchases + subscription-renewal invoices) ─────────────
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

    -- Paid draft: confirm the reservation + grant access (one-time, order_created only).
    if v_type = 'order_created' and v_prod.product_type = 'paid_competitor_draft' then
      perform app.grant_entitlement(v_tenant, v_user, v_ent, 'order', v_order_id, v_prod.creator_id, v_prod.competition_id, null);
      if nullif(v_custom->>'draft_reservation_id', '') is not null then
        update competitor_draft_assignments set status = 'confirmed', payment_status = 'paid', confirmed_at = now(), reservation_expires_at = null
          where id = (v_custom->>'draft_reservation_id')::uuid and status = 'pending_payment';
      end if;
    end if;

    -- Creator earning: initial support purchase AND every renewal/recovery invoice
    -- (immutable, idempotent per invoice order id).
    if v_prod.product_type = 'creator_support' and v_prod.creator_id is not null
       and v_type in ('order_created', 'subscription_payment_success', 'subscription_payment_recovered') then
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

revoke all on function public.apply_billing_event(uuid, jsonb) from public;
grant execute on function public.apply_billing_event(uuid, jsonb) to service_role;
