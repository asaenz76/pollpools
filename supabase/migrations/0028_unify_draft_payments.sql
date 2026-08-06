-- ============================================================================
-- 0028 — Phase 7.5 §2: unify the payment architecture (finding F-01).
--
-- Before this migration paid Competitor Draft had its OWN payment pipeline:
-- draft_competitor wrote a `draft_payments` row + a mock provider_reference, and
-- a separate `confirm_draft_payment` RPC (driven by a non-cryptographic FNV-1a
-- mock signature) flipped the assignment to paid. That duplicated the Phase-7
-- BillingProvider pipeline, which already confirms a paid-draft reservation via
-- `apply_billing_event` (custom_data.draft_reservation_id = the assignment id).
--
-- This migration removes the duplicate so there is ONE payment pipeline:
--   draft_competitor        → creates the `pending_payment` reservation only
--   billing checkout + webhook (apply_billing_event) → confirms the reservation
--
-- Paid draft is gated OFF in production (PAID_DRAFT_CHECKOUT_ENABLED=false), the
-- draft_payments table is empty pre-launch, and the free-draft path is unchanged,
-- so dropping the legacy structures is safe and removes dead code.
-- ============================================================================

-- 1) Reservation-only draft_competitor. Identical to the prior version EXCEPT the
--    paid branch no longer inserts a draft_payments row or mints a mock reference;
--    it just reserves a `pending_payment` assignment. Billing confirms it later.
create or replace function public.draft_competitor(
  p_competition_id uuid, p_competitor_id uuid, p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_settings competition_draft_settings%rowtype;
  v_tenant uuid; v_existing competitor_draft_assignments%rowtype;
  v_id uuid;
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
    -- Reservation only. Payment is completed through the BillingProvider pipeline
    -- (billing checkout → apply_billing_event confirms this assignment by id).
    v_status := 'pending_payment'; v_pay := 'pending';
    v_expires := now() + interval '10 minutes';
  else
    v_status := case when v_settings.status = 'active' then 'active'::draft_assignment_status else 'confirmed'::draft_assignment_status end;
    v_pay := 'not_required';
  end if;

  begin
    insert into competitor_draft_assignments
      (tenant_id, competition_id, competitor_id, user_id, status, assignment_source, payment_status,
       exclusive_slot, reserved_at, confirmed_at, activated_at, reservation_expires_at, idempotency_key)
    values (v_tenant, p_competition_id, p_competitor_id, v_user, v_status, 'user_selected', v_pay,
       v_exclusive, now(),
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
    'payment_required', (v_status = 'pending_payment'),
    'payment', case when v_status = 'pending_payment' then jsonb_build_object(
      'amount_minor_units', v_settings.draft_fee_minor_units, 'currency_code', v_settings.currency_code,
      'reservation_expires_at', v_expires) else null end);

  insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
    values (v_tenant, 'draft', p_idempotency_key, v_result, 'completed') on conflict do nothing;
  perform app.write_audit('draft.assign', 'competition', p_competition_id, v_tenant, v_user,
    format('Drafted competitor (%s)', v_status), jsonb_build_object('competitor_id', p_competitor_id, 'assignment_id', v_id));
  return v_result;
end; $$;

revoke all on function public.draft_competitor(uuid, uuid, text) from public;
grant execute on function public.draft_competitor(uuid, uuid, text) to authenticated, service_role;

-- 2) Reservation lifecycle helpers no longer touch draft_payments. Expiring or
--    canceling a reservation simply releases the assignment; any billing record
--    lives in the billing tables and is handled by the billing pipeline.
create or replace function public.expire_draft_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update competitor_draft_assignments
    set status = 'expired', canceled_at = now(), cancellation_reason = 'reservation_expired'
    where status in ('reserved', 'pending_payment') and reservation_expires_at is not null and reservation_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

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
  return jsonb_build_object('assignment_id', p_assignment_id, 'status', 'canceled');
end; $$;

-- 3) Remove the legacy paid-draft payment path (now handled by billing).
drop function if exists public.confirm_draft_payment(text);
alter table competitor_draft_assignments drop column if exists payment_reference_id;
drop table if exists draft_payments cascade;
