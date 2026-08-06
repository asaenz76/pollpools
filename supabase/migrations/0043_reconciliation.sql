-- ============================================================================
-- 0043 — Phase 7.5 §5H: reconciliation, repair & operational visibility.
--
-- Authoritative data (active settlement versions, immutable grades, event
-- results, finishing positions, competition config) is the ONLY source of truth.
-- Reconciliation always REBUILDS derived projections from it, reusing the
-- existing deterministic rebuild logic (app.recompute_*/refresh_*/evaluate_*) —
-- no scoring/streak/leaderboard/draft/achievement logic is duplicated here.
--
-- Modes: DRY_RUN (compute the diff by actually rebuilding inside a savepoint and
-- rolling back — no net writes), REPAIR (rebuild + record), REQUEUE (create new
-- repair jobs for actionable failures; never mutate historical job records).
-- ============================================================================

create type reconciliation_scope_type as enum ('user', 'event', 'settlement', 'competition', 'creator', 'season', 'tenant');
create type reconciliation_mode as enum ('dry_run', 'repair', 'requeue');
create type reconciliation_status as enum ('pending', 'running', 'completed', 'completed_with_differences', 'failed', 'canceled');

create table reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  scope_type reconciliation_scope_type not null,
  scope_id uuid,
  mode reconciliation_mode not null,
  status reconciliation_status not null default 'pending',
  initiated_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  differences_found integer not null default 0,
  repairs_applied integer not null default 0,
  jobs_requeued integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_reconciliation_runs_tenant on reconciliation_runs (tenant_id, created_at desc);
alter table reconciliation_runs enable row level security;
create policy recon_read on reconciliation_runs for select using (app.is_super_admin());
create trigger trg_reconciliation_runs_updated_at before update on reconciliation_runs
  for each row execute function app.set_updated_at();

-- ── Normalized projection state for a scope (volatile timestamps excluded) ────
create or replace function app.projection_state(p_tenant uuid, p_scope_type reconciliation_scope_type, p_scope_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_event uuid; v_comp uuid;
begin
  if p_scope_type = 'settlement' then
    select event_id into v_event from settlements where id = p_scope_id;
  elsif p_scope_type = 'event' then
    v_event := p_scope_id;
  end if;

  return case p_scope_type
    when 'user' then jsonb_build_object(
      'stats', (select to_jsonb(t) from (select total_predictions, correct_predictions, incorrect_predictions, voided_predictions, total_points, current_streak, best_streak from user_statistics where tenant_id = p_tenant and user_id = p_scope_id) t),
      'achievements', (select coalesce(jsonb_object_agg(achievement_id, revoked_at is null), '{}'::jsonb) from user_achievements where tenant_id = p_tenant and user_id = p_scope_id))
    when 'creator' then jsonb_build_object(
      'leaderboard', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]'::jsonb) from (select user_id, rank, total_points, correct_predictions, accuracy, ranked from leaderboard_snapshots where tenant_id = p_tenant and scope = 'creator' and scope_id = p_scope_id and period = 'all_time') t))
    when 'competition' then jsonb_build_object(
      'leaderboard', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]'::jsonb) from (select user_id, scope, rank, total_points, correct_predictions, accuracy, ranked from leaderboard_snapshots where tenant_id = p_tenant and scope in ('competition', 'season') and scope_id = p_scope_id and period = 'all_time') t),
      'draft', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]'::jsonb) from (select user_id, competition_points, rank from draft_leaderboard_snapshots where competition_id = p_scope_id) t))
    when 'season' then jsonb_build_object(
      'leaderboard', (select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id), '[]'::jsonb) from (select user_id, rank, total_points, correct_predictions, accuracy, ranked from leaderboard_snapshots where tenant_id = p_tenant and scope = 'season' and scope_id = p_scope_id and period = 'all_time') t))
    when 'event' then app.projection_state(p_tenant, 'tenant'::reconciliation_scope_type, null)
    when 'settlement' then app.projection_state(p_tenant, 'tenant'::reconciliation_scope_type, null)
    else jsonb_build_object(   -- tenant
      'stats', (select coalesce(jsonb_object_agg(user_id, jsonb_build_object('p', total_points, 'c', correct_predictions, 'i', incorrect_predictions, 'v', voided_predictions, 'cs', current_streak, 'bs', best_streak)), '{}'::jsonb) from user_statistics where tenant_id = p_tenant),
      'leaderboards', (select coalesce(jsonb_agg(to_jsonb(t) order by t.scope, t.scope_id, t.user_id), '[]'::jsonb) from (select scope, scope_id, user_id, rank, total_points, ranked from leaderboard_snapshots where tenant_id = p_tenant and period = 'all_time') t),
      'draft', (select coalesce(jsonb_agg(to_jsonb(t) order by t.competition_id, t.user_id), '[]'::jsonb) from (select d.competition_id, d.user_id, d.competition_points, d.rank from draft_leaderboard_snapshots d join competitions c on c.id = d.competition_id where c.tenant_id = p_tenant) t),
      'achievements', (select coalesce(jsonb_object_agg(user_id || ':' || achievement_id, revoked_at is null), '{}'::jsonb) from user_achievements where tenant_id = p_tenant))
  end;
end; $$;

-- ── Rebuild a scope from authoritative data (reuses internal app.* logic) ──────
create or replace function app.rebuild_scope(p_tenant uuid, p_scope_type reconciliation_scope_type, p_scope_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_comp uuid; r record; v_event uuid;
begin
  case p_scope_type
    when 'user' then
      perform app.recompute_user_statistics(p_tenant, p_scope_id);
      perform app.evaluate_achievements(p_tenant, p_scope_id);
    when 'creator' then
      perform app.refresh_creator_leaderboard(p_tenant, p_scope_id);
    when 'competition', 'season' then
      perform app.refresh_competition_leaderboard(p_tenant, p_scope_id);
      perform app.recompute_competitor_competition_stats(p_tenant, p_scope_id);
      perform app.refresh_draft_leaderboard(p_tenant, p_scope_id);
    when 'event', 'settlement' then
      if p_scope_type = 'settlement' then select event_id into v_event from settlements where id = p_scope_id; else v_event := p_scope_id; end if;
      for r in select distinct user_id from settlement_grades g join settlements s on s.id = g.settlement_id and s.status = 'active' where g.event_id = v_event loop
        perform app.recompute_user_statistics(p_tenant, r.user_id);
        perform app.evaluate_achievements(p_tenant, r.user_id);
      end loop;
      select competition_id into v_comp from events where id = v_event;
      perform app.refresh_global_leaderboard(p_tenant);
      for r in select creator_id from events where id = v_event loop perform app.refresh_creator_leaderboard(p_tenant, r.creator_id); end loop;
      if v_comp is not null then perform app.refresh_competition_leaderboard(p_tenant, v_comp); perform app.recompute_competitor_competition_stats(p_tenant, v_comp); perform app.refresh_draft_leaderboard(p_tenant, v_comp); end if;
    else  -- tenant
      for r in select id from users u where exists (select 1 from settlement_grades g where g.tenant_id = p_tenant and g.user_id = u.id) loop
        perform app.recompute_user_statistics(p_tenant, r.id);
        perform app.evaluate_achievements(p_tenant, r.id);
      end loop;
      perform app.refresh_global_leaderboard(p_tenant);
      for r in select id from creators where tenant_id = p_tenant loop perform app.refresh_creator_leaderboard(p_tenant, r.id); end loop;
      for r in select id from competitions where tenant_id = p_tenant loop
        perform app.refresh_competition_leaderboard(p_tenant, r.id);
        perform app.recompute_competitor_competition_stats(p_tenant, r.id);
        perform app.refresh_draft_leaderboard(p_tenant, r.id);
      end loop;
  end case;
end; $$;

-- ── Structured diff of two projection-state snapshots ─────────────────────────
create or replace function app.projection_diff(p_before jsonb, p_after jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare k text; v_diffs jsonb := '{}'::jsonb;
begin
  for k in select jsonb_object_keys(coalesce(p_after, '{}'::jsonb)) loop
    if coalesce(p_before->k, 'null'::jsonb) is distinct from coalesce(p_after->k, 'null'::jsonb) then
      v_diffs := v_diffs || jsonb_build_object(k, jsonb_build_object('before', p_before->k, 'after', p_after->k));
    end if;
  end loop;
  return v_diffs;
end; $$;

-- ── The reconciliation orchestrator ───────────────────────────────────────────
create or replace function public.reconcile(
  p_tenant uuid, p_scope_type reconciliation_scope_type, p_scope_id uuid,
  p_mode reconciliation_mode, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_run reconciliation_runs%rowtype; v_before jsonb; v_after jsonb; v_diff jsonb; v_ndiff int;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  -- Cross-tenant guard for scoped rebuilds.
  if p_scope_type = 'competition' and not exists (select 1 from competitions where id = p_scope_id and tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type = 'creator' and not exists (select 1 from creators where id = p_scope_id and tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;
  if p_scope_type in ('event') and not exists (select 1 from events where id = p_scope_id and tenant_id = p_tenant) then raise exception 'CROSS_TENANT_SCOPE' using errcode = '42501'; end if;

  select * into v_run from reconciliation_runs where idempotency_key = p_idempotency_key;
  if found then return v_run.summary || jsonb_build_object('run_id', v_run.id, 'idempotent', true, 'status', v_run.status); end if;

  -- Concurrency-safe: two identical requests race → the unique idempotency_key
  -- admits exactly one run; the loser re-reads and returns it idempotently.
  insert into reconciliation_runs (tenant_id, scope_type, scope_id, mode, status, initiated_by, started_at, idempotency_key)
  values (p_tenant, p_scope_type, p_scope_id, p_mode, 'running', auth.uid(), now(), p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning * into v_run;
  if v_run.id is null then
    select * into v_run from reconciliation_runs where idempotency_key = p_idempotency_key;
    return v_run.summary || jsonb_build_object('run_id', v_run.id, 'idempotent', true, 'status', v_run.status);
  end if;

  if p_mode = 'requeue' then
    -- Requeue handled by a dedicated function; reconcile records the run.
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
      raise exception 'RECON_DRYRUN_ROLLBACK';   -- undo the rebuild writes; keep v_diff
    end if;
  exception when others then
    if sqlerrm <> 'RECON_DRYRUN_ROLLBACK' then
      update reconciliation_runs set status = 'failed', failed_at = now(), error = left(sqlerrm, 500) where id = v_run.id;
      perform app.write_audit('reconcile.failed', 'reconciliation', v_run.id, p_tenant, auth.uid(), left(sqlerrm, 200), '{}'::jsonb);
      raise;
    end if;
    -- dry_run: writes rolled back, v_diff persists.
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

-- ── Job classification (actionable vs stale/historical) ───────────────────────
create or replace function app.classify_projection_job(p_job_id uuid, p_stuck_minutes int default 15)
returns text language plpgsql stable security definer set search_path = public as $$
declare j system_jobs%rowtype; v_settlement uuid; v_active boolean;
begin
  select * into j from system_jobs where id = p_job_id;
  if not found then return 'unknown'; end if;
  if j.job_type not like 'projection.%' then
    if j.status in ('failed', 'dead') then return 'current_and_actionable'; else return 'current_and_actionable'; end if;
  end if;
  v_settlement := nullif(j.payload->>'settlement_id', '')::uuid;
  if v_settlement is not null then
    v_active := exists (select 1 from settlements s where s.id = v_settlement and s.status = 'active'
      and s.grading_version = coalesce((j.payload->>'grading_version')::int, s.grading_version));
    if not v_active then
      return case when j.status = 'dead' then 'dead_letter_historical' else 'stale_version' end;
    end if;
  end if;
  -- current version (or a non-versioned projection like event-publish)
  if j.status = 'dead' then return 'dead_letter_current';
  elsif j.status = 'running' and j.started_at < now() - make_interval(mins => p_stuck_minutes) then return 'stuck';
  elsif j.status = 'failed' then return 'current_and_actionable';
  elsif j.status = 'pending' and coalesce(j.error, '') ilike '%blocked%' then return 'missing_prerequisite';
  elsif j.status in ('pending', 'running') then return 'current_and_actionable';
  else return 'resolved';  -- succeeded / canceled
  end if;
end; $$;

-- ── Requeue actionable failures (new job referencing the original; auditable) ─
create or replace function public.requeue_actionable_jobs(p_tenant uuid, p_stuck_minutes int default 15)
returns integer language plpgsql security definer set search_path = public as $$
declare j record; v_class text; v_count int := 0; v_new uuid;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  for j in
    select * from system_jobs
    where tenant_id = p_tenant
      and (status in ('dead', 'failed')
        or (status = 'running' and started_at < now() - make_interval(mins => p_stuck_minutes)))
  loop
    v_class := app.classify_projection_job(j.id, p_stuck_minutes);
    if v_class in ('current_and_actionable', 'dead_letter_current', 'stuck') then
      -- New job, new id, references the original, repair-specific dedup key. The
      -- original record is preserved (never mutated). Dedup makes requeue idempotent.
      v_new := public.enqueue_job(p_tenant, j.job_type,
        j.payload || jsonb_build_object('requeued_from', j.id),
        'repair:' || j.id::text);
      if v_new is not null then v_count := v_count + 1; end if;
    end if;
  end loop;
  return v_count;
end; $$;

-- ── Operational visibility: job stats + projection health ─────────────────────
create or replace function public.projection_job_stats(p_tenant uuid, p_stuck_minutes int default 15)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'running', count(*) filter (where status = 'running'),
    'retrying', count(*) filter (where status = 'failed' and attempts < max_attempts),
    'dead', count(*) filter (where status = 'dead'),
    'stuck', count(*) filter (where status = 'running' and started_at < now() - make_interval(mins => p_stuck_minutes)),
    'succeeded', count(*) filter (where status = 'succeeded'),
    'canceled', count(*) filter (where status = 'canceled'),
    'oldest_pending_seconds', coalesce(extract(epoch from (now() - min(run_at) filter (where status = 'pending')))::int, 0),
    'by_type', (select coalesce(jsonb_object_agg(job_type, c), '{}'::jsonb) from (select job_type, count(*) c from system_jobs where tenant_id = p_tenant and status not in ('succeeded', 'canceled') group by job_type) t),
    'recent_failures', (select coalesce(jsonb_agg(jsonb_build_object('job_type', job_type, 'error', left(error, 200)) order by finished_at desc), '[]'::jsonb) from (select job_type, error, finished_at from system_jobs where tenant_id = p_tenant and status = 'dead' order by finished_at desc limit 10) t)
  ) into v from system_jobs where tenant_id = p_tenant;
  return v;
end; $$;

-- Current dead-letter prerequisite = a dead user_stats job whose settlement is
-- STILL active (a live projection cannot converge). Distinct from historical
-- (old-version) dead-letters, which never mark current health critical.
create or replace function public.projection_health(p_tenant uuid, p_stuck_minutes int default 15, p_delay_warn_seconds int default 300)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_dead_current int; v_stuck int; v_retrying int; v_oldest int; v_recon_failed int; v_state text;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select count(*) into v_dead_current from system_jobs j
    where j.tenant_id = p_tenant and j.status = 'dead' and j.job_type like 'projection.%'
      and exists (select 1 from settlements s where s.id = nullif(j.payload->>'settlement_id','')::uuid and s.status = 'active'
        and s.grading_version = coalesce((j.payload->>'grading_version')::int, s.grading_version));
  select count(*) into v_stuck from system_jobs where tenant_id = p_tenant and status = 'running' and started_at < now() - make_interval(mins => p_stuck_minutes);
  select count(*) into v_retrying from system_jobs j where j.tenant_id = p_tenant and j.status = 'failed' and j.attempts < j.max_attempts
    and (nullif(j.payload->>'settlement_id','') is null or exists (select 1 from settlements s where s.id = (j.payload->>'settlement_id')::uuid and s.status = 'active'));
  select coalesce(extract(epoch from (now() - min(run_at)))::int, 0) into v_oldest from system_jobs where tenant_id = p_tenant and status = 'pending';
  select count(*) into v_recon_failed from reconciliation_runs where tenant_id = p_tenant and status = 'failed' and created_at > now() - interval '1 hour';

  v_state := case
    when v_recon_failed > 0 then 'critical'
    when v_dead_current > 0 then 'blocked'
    when v_retrying > 0 then 'degraded'
    when v_oldest > p_delay_warn_seconds then 'delayed'
    else 'healthy' end;
  return jsonb_build_object('state', v_state, 'dead_letter_current', v_dead_current, 'stuck', v_stuck,
    'retrying_current', v_retrying, 'oldest_pending_seconds', v_oldest, 'reconciliation_failures_1h', v_recon_failed);
end; $$;

-- ── Grants (service role / super admin only) ──────────────────────────────────
revoke all on function public.reconcile(uuid, reconciliation_scope_type, uuid, reconciliation_mode, text) from public;
revoke all on function public.requeue_actionable_jobs(uuid, int) from public;
revoke all on function public.projection_job_stats(uuid, int) from public;
revoke all on function public.projection_health(uuid, int, int) from public;
grant execute on function public.reconcile(uuid, reconciliation_scope_type, uuid, reconciliation_mode, text) to authenticated, service_role;
grant execute on function public.requeue_actionable_jobs(uuid, int) to authenticated, service_role;
grant execute on function public.projection_job_stats(uuid, int) to authenticated, service_role;
grant execute on function public.projection_health(uuid, int, int) to authenticated, service_role;
