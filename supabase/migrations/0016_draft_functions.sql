-- ============================================================================
-- 0016_draft_functions.sql  (Phase 4.5)
-- Draft participation flow. draft_competitor is the ONLY way to create an
-- assignment. FREE → confirmed immediately; PAID → reservation + mock payment,
-- confirmed via confirm_draft_payment (service role / verified webhook only).
-- Fee and currency ALWAYS come from server config, never the client.
-- ============================================================================

create or replace function public.draft_competitor(
  p_competition_id uuid, p_competitor_id uuid, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_settings competition_draft_settings%rowtype;
  v_tenant uuid; v_existing competitor_draft_assignments%rowtype;
  v_id uuid; v_payment_id uuid; v_ref text;
  v_status draft_assignment_status; v_pay draft_payment_status;
  v_exclusive boolean; v_prior jsonb; v_result jsonb; v_expires timestamptz;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22000';
  end if;

  select response into v_prior from idempotency_records where scope = 'draft' and idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  select * into v_settings from competition_draft_settings where competition_id = p_competition_id for update;
  if not found or not v_settings.is_enabled then raise exception 'DRAFT_NOT_ENABLED' using errcode = '22000'; end if;
  v_tenant := v_settings.tenant_id;

  if not exists (select 1 from tenant_memberships m where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active') then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  if v_settings.status not in ('open', 'active') then raise exception 'DRAFT_NOT_OPEN' using errcode = '22000'; end if;
  if v_settings.opens_at is not null and now() < v_settings.opens_at then raise exception 'DRAFT_NOT_OPEN' using errcode = '22000'; end if;
  if v_settings.closes_at is not null and now() >= v_settings.closes_at then raise exception 'DRAFT_CLOSED' using errcode = '22000'; end if;

  if not exists (select 1 from competitors c where c.id = p_competitor_id and c.tenant_id = v_tenant) then
    raise exception 'INVALID_COMPETITOR' using errcode = '22000';
  end if;

  -- Serialize concurrent draws for the SAME (competition, competitor).
  perform pg_advisory_xact_lock(hashtextextended(p_competition_id::text || ':' || p_competitor_id::text, 0));

  -- Existing live assignment for this user?
  select * into v_existing from competitor_draft_assignments
    where competition_id = p_competition_id and user_id = v_user and status not in ('canceled', 'expired')
    order by created_at desc limit 1;
  if found then
    if v_existing.competitor_id = p_competitor_id then
      v_result := jsonb_build_object('assignment_id', v_existing.id, 'status', v_existing.status,
        'competition_id', p_competition_id, 'competitor_id', p_competitor_id, 'existing', true);
      insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
        values (v_tenant, 'draft', p_idempotency_key, v_result, 'completed') on conflict do nothing;
      return v_result;
    end if;
    raise exception 'ALREADY_HAS_ASSIGNMENT' using errcode = '22000';
  end if;

  v_exclusive := (v_settings.mode = 'exclusive');
  if v_exclusive and exists (
    select 1 from competitor_draft_assignments
    where competition_id = p_competition_id and competitor_id = p_competitor_id
      and exclusive_slot and status not in ('canceled', 'expired')
  ) then
    raise exception 'COMPETITOR_UNAVAILABLE' using errcode = '22000';
  end if;

  if v_settings.access_type = 'paid' then
    v_status := 'pending_payment'; v_pay := 'pending';
    v_ref := 'mock_' || replace(gen_random_uuid()::text, '-', '');
    v_expires := now() + interval '10 minutes';
    insert into draft_payments (tenant_id, competition_id, user_id, provider, provider_reference, amount_minor_units, currency_code, status)
      values (v_tenant, p_competition_id, v_user, 'mock', v_ref, v_settings.draft_fee_minor_units, v_settings.currency_code, 'pending')
      returning id into v_payment_id;
  else
    v_status := case when v_settings.status = 'active' then 'active'::draft_assignment_status else 'confirmed'::draft_assignment_status end;
    v_pay := 'not_required';
  end if;

  begin
    insert into competitor_draft_assignments
      (tenant_id, competition_id, competitor_id, user_id, status, assignment_source, payment_status,
       payment_reference_id, exclusive_slot, reserved_at, confirmed_at, activated_at, reservation_expires_at, idempotency_key)
    values (v_tenant, p_competition_id, p_competitor_id, v_user, v_status, 'user_selected', v_pay,
       v_payment_id, v_exclusive, now(),
       case when v_status in ('confirmed', 'active') then now() end,
       case when v_status = 'active' then now() end,
       v_expires, p_idempotency_key)
    returning id into v_id;
  exception when unique_violation then
    -- Backstop for concurrency: exactly one exclusive draw wins.
    raise exception 'COMPETITOR_UNAVAILABLE' using errcode = '22000';
  end;

  v_result := jsonb_build_object(
    'assignment_id', v_id, 'status', v_status, 'competition_id', p_competition_id,
    'competitor_id', p_competitor_id, 'access_type', v_settings.access_type,
    'payment', case when v_payment_id is not null then jsonb_build_object(
      'provider', 'mock', 'reference', v_ref,
      'amount_minor_units', v_settings.draft_fee_minor_units, 'currency_code', v_settings.currency_code,
      'reservation_expires_at', v_expires) else null end);

  insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
    values (v_tenant, 'draft', p_idempotency_key, v_result, 'completed') on conflict do nothing;
  perform app.write_audit('draft.assign', 'competition', p_competition_id, v_tenant, v_user,
    format('Drafted competitor (%s)', v_status), jsonb_build_object('competitor_id', p_competitor_id, 'assignment_id', v_id));
  return v_result;
end; $$;

-- Confirm a paid draft after verified payment. Service role / webhook only.
create or replace function public.confirm_draft_payment(p_provider_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_payment draft_payments%rowtype; v_asg competitor_draft_assignments%rowtype; v_settings competition_draft_settings%rowtype; v_status draft_assignment_status;
begin
  select * into v_payment from draft_payments where provider = 'mock' and provider_reference = p_provider_reference for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into v_asg from competitor_draft_assignments where payment_reference_id = v_payment.id order by created_at desc limit 1;

  if v_payment.status = 'paid' then  -- idempotent replay
    return jsonb_build_object('assignment_id', v_asg.id, 'status', v_asg.status, 'already', true);
  end if;

  update draft_payments set status = 'paid', confirmed_at = now() where id = v_payment.id;

  if v_asg.id is not null and v_asg.status = 'pending_payment' then
    select * into v_settings from competition_draft_settings where competition_id = v_asg.competition_id;
    v_status := case when v_settings.status = 'active' then 'active'::draft_assignment_status else 'confirmed'::draft_assignment_status end;
    update competitor_draft_assignments
      set status = v_status, payment_status = 'paid', confirmed_at = now(),
          activated_at = case when v_status = 'active' then now() end, reservation_expires_at = null
      where id = v_asg.id;
    perform app.write_audit('draft.payment_confirmed', 'competition', v_asg.competition_id, v_payment.tenant_id, v_asg.user_id,
      'Draft payment confirmed', jsonb_build_object('assignment_id', v_asg.id));
  end if;

  return jsonb_build_object('assignment_id', v_asg.id, 'status', coalesce(v_status, v_asg.status));
end; $$;

-- Expire stale reservations and release the competitor. Service role / cron.
create or replace function public.expire_draft_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with expired as (
    update competitor_draft_assignments
      set status = 'expired', canceled_at = now(), cancellation_reason = 'reservation_expired'
      where status in ('reserved', 'pending_payment') and reservation_expires_at is not null and reservation_expires_at < now()
      returning payment_reference_id
  )
  update draft_payments set status = 'canceled'
    where id in (select payment_reference_id from expired where payment_reference_id is not null) and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Cancel an assignment (user before confirmation, or super admin any time).
create or replace function public.cancel_draft_assignment(p_assignment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_asg competitor_draft_assignments%rowtype;
begin
  select * into v_asg from competitor_draft_assignments where id = p_assignment_id for update;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if not (app.is_super_admin() or (v_asg.user_id = auth.uid() and v_asg.status in ('reserved', 'pending_payment'))) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update competitor_draft_assignments
    set status = 'canceled', canceled_at = now(), cancellation_reason = coalesce(p_reason, 'user_canceled')
    where id = p_assignment_id;
  if v_asg.payment_reference_id is not null then
    update draft_payments set status = 'canceled' where id = v_asg.payment_reference_id and status = 'pending';
  end if;
  return jsonb_build_object('assignment_id', p_assignment_id, 'status', 'canceled');
end; $$;

-- Grants: draft_competitor / cancel for members; payment confirm + expiry service-only.
revoke all on function public.draft_competitor(uuid, uuid, text) from public;
grant execute on function public.draft_competitor(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.cancel_draft_assignment(uuid, text) from public;
grant execute on function public.cancel_draft_assignment(uuid, text) to authenticated, service_role;
revoke all on function public.confirm_draft_payment(text) from public;
grant execute on function public.confirm_draft_payment(text) to service_role;
revoke all on function public.expire_draft_reservations() from public;
grant execute on function public.expire_draft_reservations() to service_role;
