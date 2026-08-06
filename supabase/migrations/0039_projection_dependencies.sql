-- ============================================================================
-- 0039 — Phase 7.5 §5D hardening: explicit projection dependencies.
--
-- FIFO (system_jobs.seq) guarantees leaderboard jobs are *processed* after the
-- stats jobs are enqueued — but NOT that those stats jobs *succeeded*. A stats
-- job could fail and be scheduled for retry, and a later leaderboard job would
-- then read stale statistics. This adds an EXPLICIT prerequisite rule: a
-- stats-dependent leaderboard refresh only runs once every user-statistics job
-- for the same settlement has succeeded.
--
--   ready    → all required stats jobs succeeded (or there are none) → refresh
--   pending  → some are still pending/running/retryable-failed → DEFER (retry the
--              leaderboard job later; visible; NOT a permanent failure)
--   blocked  → a required stats job DEAD-lettered → do not publish stale data;
--              fail the leaderboard job visibly. §5H reconciliation can repair.
--
-- Prerequisites are scoped by settlement_id, so an OLDER grading version's dead
-- stats job never blocks the current version (its settlement_id differs, and a
-- stale leaderboard job short-circuits on the active-version check first).
-- Creator scope aggregates raw grades directly, so it has no stats dependency.
-- ============================================================================

-- Prerequisite status of the user-statistics jobs for a settlement.
create or replace function app.user_stats_prereqs(p_settlement_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when count(*) = 0 then 'ready'                                        -- no predictors → nothing to wait on
    when count(*) filter (where status = 'dead') > 0 then 'blocked'
    when count(*) filter (where status = 'succeeded') = count(*) then 'ready'
    else 'pending'
  end
  from system_jobs
  where job_type = 'projection.user_stats' and (payload->>'settlement_id')::uuid = p_settlement_id;
$$;

-- Defer a job: re-schedule without consuming the failure budget (undo the claim's
-- attempt increment). Deferral is bounded by the prerequisite's own lifecycle
-- (it eventually succeeds or dead-letters), so this cannot loop forever.
create or replace function public.defer_job(p_id uuid, p_reason text, p_delay_seconds int default 5)
returns void language sql security definer set search_path = public as $$
  update system_jobs set status = 'pending', run_at = now() + make_interval(secs => greatest(p_delay_seconds, 1)),
    error = p_reason, finished_at = null, attempts = greatest(attempts - 1, 0)
  where id = p_id;
$$;

-- project_leaderboard_scope now returns a status the worker acts on:
--   'applied' | 'stale' | 'defer' | 'blocked'
drop function if exists public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid);
create or replace function public.project_leaderboard_scope(
  p_tenant uuid, p_event uuid, p_version int, p_settlement_id uuid, p_scope text, p_scope_id uuid
) returns text language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_pre text;
begin
  -- Stale / not the active settlement for this version → no-op.
  if not exists (
    select 1 from settlements where id = p_settlement_id and event_id = p_event and status = 'active' and grading_version = p_version
  ) then return 'stale'; end if;

  -- The event must actually belong to the requested scope.
  v_ok := case p_scope
    when 'global' then true
    when 'creator' then exists (select 1 from events where id = p_event and creator_id = p_scope_id)
    when 'competition' then exists (select 1 from events where id = p_event and competition_id = p_scope_id)
    when 'season' then exists (select 1 from events where id = p_event and competition_id = p_scope_id)
    else false end;
  if not v_ok then raise exception 'EVENT_NOT_IN_SCOPE' using errcode = '22000'; end if;

  -- Stats-dependent scopes must wait for the user-statistics projections. Creator
  -- aggregates raw grades directly and has no such dependency.
  if p_scope in ('global', 'competition', 'season') then
    v_pre := app.user_stats_prereqs(p_settlement_id);
    if v_pre = 'blocked' then return 'blocked'; end if;
    if v_pre = 'pending' then return 'defer'; end if;
  end if;

  case p_scope
    when 'global' then perform app.refresh_global_leaderboard(p_tenant);
    when 'creator' then perform app.refresh_creator_leaderboard(p_tenant, p_scope_id);
    else perform app.refresh_competition_leaderboard(p_tenant, p_scope_id);  -- competition | season
  end case;
  return 'applied';
end; $$;

revoke all on function public.defer_job(uuid, text, int) from public;
grant execute on function public.defer_job(uuid, text, int) to service_role;
revoke all on function public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid) from public;
grant execute on function public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid) to service_role;
