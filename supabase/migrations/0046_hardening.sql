-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7.6 §12 — small verified hardening items from Architecture Review v2.
--   6. Add the missing predictions(market_id, status) index (F-20).
--   7. Remove the orphaned app.recompute_after_settlement dead code (F-02 residual).
--   9. Harden reconciliation cross-tenant validation for EVERY scope type.
-- (Items 1, 4, 8 are app-layer; 2, 3, 5 are added test coverage.)
-- ─────────────────────────────────────────────────────────────────────────────

-- 6. The read-time sentiment count filters predictions on (market_id, status<>void);
--    only (market_id) was indexed. Cover the status predicate.
create index if not exists idx_predictions_market_status on predictions (market_id, status);

-- 7. Orphaned synchronous full-tenant recompute. The live settle_event/regrade_event
--    (0036) do NOT call it; only superseded 0011/0033 bodies referenced it. Drop it
--    so it can never be accidentally re-wired into the settlement path.
drop function if exists app.recompute_after_settlement(uuid, uuid);

-- 9. Cross-tenant guard for the reconciliation orchestrator, now covering every
--    supported scope (previously only competition/creator/event). user/settlement/
--    season/tenant scope_ids belonging to another tenant are rejected. The body is
--    otherwise identical to 0043; the reconciliation test matrix guards it.
create or replace function public.reconcile(
  p_tenant uuid, p_scope_type reconciliation_scope_type, p_scope_id uuid,
  p_mode reconciliation_mode, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run reconciliation_runs%rowtype; v_before jsonb; v_after jsonb; v_diff jsonb; v_ndiff int;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  -- Cross-tenant guard for EVERY scoped rebuild.
  if p_scope_type = 'competition' and not exists (select 1 from competitions where id = p_scope_id and tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'season' and not exists (select 1 from competitions where id = p_scope_id and tenant_id = p_tenant and type = 'SEASON') then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'creator' and not exists (select 1 from creators where id = p_scope_id and tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'event' and not exists (select 1 from events where id = p_scope_id and tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'settlement' and not exists (select 1 from settlements s join events e on e.id = s.event_id where s.id = p_scope_id and e.tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'user' and not exists (
    select 1 from tenant_memberships where user_id = p_scope_id and tenant_id = p_tenant
    union all select 1 from user_statistics where user_id = p_scope_id and tenant_id = p_tenant
  ) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'tenant' and p_scope_id is not null and p_scope_id <> p_tenant then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;

  select * into v_run from reconciliation_runs where idempotency_key = p_idempotency_key;
  if found then return v_run.summary || jsonb_build_object('run_id', v_run.id, 'idempotent', true, 'status', v_run.status); end if;

  insert into reconciliation_runs (tenant_id, scope_type, scope_id, mode, status, initiated_by, started_at, idempotency_key)
  values (p_tenant, p_scope_type, p_scope_id, p_mode, 'running', auth.uid(), now(), p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_run;
  if v_run.id is null then
    select * into v_run from reconciliation_runs where idempotency_key = p_idempotency_key;
    return v_run.summary || jsonb_build_object('run_id', v_run.id, 'idempotent', true, 'status', v_run.status);
  end if;

  if p_mode = 'requeue' then
    declare v_requeued int;
    begin
      v_requeued := public.requeue_actionable_jobs(p_tenant, 15);
      update reconciliation_runs set status = 'completed', completed_at = now(), jobs_requeued = v_requeued,
        summary = jsonb_build_object('jobs_requeued', v_requeued) where id = v_run.id;
      perform app.write_audit('reconcile.requeue', 'reconciliation', v_run.id, p_tenant, auth.uid(), 'Requeued actionable jobs', jsonb_build_object('count', v_requeued));
      return jsonb_build_object('run_id', v_run.id, 'status', 'completed', 'jobs_requeued', v_requeued);
    end;
  end if;

  v_before := app.projection_state(p_tenant, p_scope_type, p_scope_id);
  begin
    perform app.rebuild_scope(p_tenant, p_scope_type, p_scope_id);
    v_after := app.projection_state(p_tenant, p_scope_type, p_scope_id);
    v_diff := app.projection_diff(v_before, v_after);
    if p_mode = 'dry_run' then
      raise exception 'RECON_DRYRUN_ROLLBACK';
    end if;
  exception when others then
    if sqlerrm <> 'RECON_DRYRUN_ROLLBACK' then
      update reconciliation_runs set status = 'failed', failed_at = now(), error = left(sqlerrm, 500) where id = v_run.id;
      perform app.write_audit('reconcile.failed', 'reconciliation', v_run.id, p_tenant, auth.uid(), left(sqlerrm, 200), '{}'::jsonb);
      raise;
    end if;
  end;

  v_ndiff := (select count(*) from jsonb_object_keys(coalesce(v_diff, '{}'::jsonb)));
  update reconciliation_runs set
    status = (case when v_ndiff > 0 then 'completed_with_differences' else 'completed' end)::reconciliation_status,
    completed_at = now(), differences_found = v_ndiff,
    repairs_applied = case when p_mode = 'repair' then v_ndiff else 0 end,
    summary = jsonb_build_object('differences', v_diff, 'mode', p_mode)
  where id = v_run.id;
  perform app.write_audit(case when p_mode = 'repair' then 'reconcile.repair' else 'reconcile.dry_run' end,
    'reconciliation', v_run.id, p_tenant, auth.uid(), format('%s %s (%s diffs)', p_mode, p_scope_type, v_ndiff),
    jsonb_build_object('scope_type', p_scope_type, 'scope_id', p_scope_id, 'differences_found', v_ndiff));

  return jsonb_build_object('run_id', v_run.id, 'mode', p_mode, 'scope_type', p_scope_type,
    'status', case when v_ndiff > 0 then 'completed_with_differences' else 'completed' end,
    'differences_found', v_ndiff, 'repairs_applied', case when p_mode = 'repair' then v_ndiff else 0 end,
    'differences', v_diff);
end; $$;
