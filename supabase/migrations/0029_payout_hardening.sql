-- ============================================================================
-- 0029 — Phase 7.5 §2: payout hardening (findings F-25, F-26).
--
-- F-26: approve_creator_payout's insufficient-earnings branch deleted the
--       allocations BEFORE the UPDATE that released them, so the UPDATE matched
--       nothing (harmless only because the following RAISE rolled back). Reorder
--       so the release runs before the delete.
-- F-25: a payout request stored a client-supplied amount with no server check
--       against the ledger. Add a BEFORE INSERT trigger that rejects a request
--       exceeding the creator's available (unallocated) earnings.
-- ============================================================================

-- F-26 — reorder release-before-delete in the insufficient-earnings branch.
create or replace function public.approve_creator_payout(p_payout_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req creator_payout_requests%rowtype; e record; v_alloc int := 0;
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
    -- Not enough available earnings: release the reserved earnings, THEN drop the
    -- allocations (release must read the allocations before they are deleted).
    update creator_earnings set status = 'available'
      where id in (select earning_id from creator_payout_allocations where payout_request_id = p_payout_id);
    delete from creator_payout_allocations where payout_request_id = p_payout_id;
    update creator_payout_requests set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), notes = 'Insufficient available earnings' where id = p_payout_id;
    raise exception 'INSUFFICIENT_EARNINGS' using errcode = '22000';
  end if;

  update creator_payout_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_payout_id;
  perform app.write_audit('payout.approve', 'creator_payout', p_payout_id, v_req.tenant_id, auth.uid(), 'Approved', jsonb_build_object('allocated', v_alloc));
  return jsonb_build_object('payout_id', p_payout_id, 'allocated_minor_units', v_alloc);
end; $$;

-- F-25 — reject a payout request that exceeds available (unallocated) earnings.
create or replace function app.check_payout_request_funds()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_available int;
begin
  select coalesce(sum(ce.creator_share_minor_units), 0) into v_available
  from creator_earnings ce
  where ce.tenant_id = new.tenant_id and ce.creator_id = new.creator_id and ce.status = 'available'
    and ce.creator_share_minor_units > 0
    and not exists (select 1 from creator_payout_allocations a where a.earning_id = ce.id);

  if new.amount_minor_units is null or new.amount_minor_units <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22000';
  end if;
  if new.amount_minor_units > v_available then
    raise exception 'INSUFFICIENT_EARNINGS' using errcode = '22000';
  end if;
  return new;
end; $$;

drop trigger if exists trg_check_payout_request_funds on creator_payout_requests;
create trigger trg_check_payout_request_funds
  before insert on creator_payout_requests
  for each row execute function app.check_payout_request_funds();
