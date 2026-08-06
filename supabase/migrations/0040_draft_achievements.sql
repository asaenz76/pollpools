-- ============================================================================
-- 0040 — Phase 7.5 §5E: draft standings + achievements refinement (F-15).
--
-- FINISHING POSITION MODEL. Finishing positions are authoritative result data,
-- stored per grading version in `event_competitor_results` (historical versions
-- are never deleted). Two kinds of row are now distinguished by `recorded`:
--   * recorded=true  — a full finishing order explicitly recorded via
--                      record_event_positions (the authoritative order).
--   * recorded=false — a winner-only baseline derived from the settlement winner
--                      (a fallback when no full order was recorded).
--
-- Regrade rule (F-15):
--   * If a regrade only changes the winning INTERPRETATION and a full order was
--     recorded, the recorded positions are CARRIED FORWARD to the new version
--     (the finishing order is unchanged). Historical rows are preserved.
--   * If the corrected result changes the finishing order, the operator records a
--     new order for the new active version (record_event_positions), which
--     supersedes the carried-forward set for that version only.
--   * A winner-only baseline is NOT carried forward — a new version derives its
--     own baseline from its own winner (so a winner change updates it).
--
-- Missing-positions policy (no recorded order anywhere): use the winner-only
-- baseline ONLY if the competition permits it (competition_draft_settings.
-- winner_only_fallback, default true); otherwise the projection is BLOCKED
-- (fails visibly) rather than silently inventing a degraded result.
-- ============================================================================

alter table event_competitor_results add column if not exists recorded boolean not null default false;
alter table competition_draft_settings add column if not exists winner_only_fallback boolean not null default true;

-- Prerequisite checks (leaderboard + achievements) look up a settlement's
-- user-statistics jobs by settlement_id inside the JSONB payload. Index that
-- lookup so the check stays O(jobs-for-settlement), not a scan of all jobs.
create index if not exists idx_system_jobs_stats_settlement
  on system_jobs (((payload->>'settlement_id')::uuid))
  where job_type = 'projection.user_stats';

-- record_event_positions marks its rows as the authoritative recorded order.
create or replace function public.record_event_positions(p_event_id uuid, p_positions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event events%rowtype; v_version int; v_comp uuid; v_pos jsonb; v_count int := 0;
begin
  if not app.can_settle_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_event from events where id = p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_comp := v_event.competition_id;

  select grading_version into v_version from settlements where event_id = p_event_id and status = 'active';
  if v_version is null then raise exception 'NOT_SETTLED' using errcode = '22000'; end if;

  delete from event_competitor_results where event_id = p_event_id and grading_version = v_version;
  for v_pos in select * from jsonb_array_elements(p_positions) loop
    insert into event_competitor_results (tenant_id, event_id, grading_version, competitor_id, finishing_position, points, recorded)
    values (v_event.tenant_id, p_event_id, v_version, (v_pos->>'competitor_id')::uuid, (v_pos->>'position')::int,
            app.draft_position_points(v_comp, (v_pos->>'position')::int), true);
    v_count := v_count + 1;
  end loop;

  perform app.recompute_competitor_competition_stats(v_event.tenant_id, v_comp);
  perform app.refresh_draft_leaderboard(v_event.tenant_id, v_comp);
  return jsonb_build_object('event_id', p_event_id, 'grading_version', v_version, 'recorded', v_count);
end; $$;

-- Draft settlement for one version: carry forward recorded positions, else a
-- gated winner-only baseline. Returns 'applied' | 'blocked'.
drop function if exists app.settle_draft_for_event(uuid, uuid, uuid, text, int);
create or replace function app.settle_draft_for_event(p_event uuid, p_tenant uuid, p_version int)
returns text language plpgsql security definer set search_path = public as $$
declare v_comp uuid; v_enabled boolean; v_fallback boolean; v_winner uuid; v_resolution text; v_prior int; v_has_current boolean;
begin
  select competition_id into v_comp from events where id = p_event;
  if v_comp is null then return 'applied'; end if;                 -- no competition → nothing to do
  select is_enabled, winner_only_fallback into v_enabled, v_fallback from competition_draft_settings where competition_id = v_comp;
  if v_enabled is not true then return 'applied'; end if;          -- draft not enabled → Phase-4 unaffected

  select winning_competitor_id, resolution into v_winner, v_resolution
    from event_results where event_id = p_event and grading_version = p_version;

  if coalesce(v_resolution, '') <> 'settled' then
    delete from event_competitor_results where event_id = p_event and grading_version = p_version;  -- void/cancel → no draft points
  else
    select exists (select 1 from event_competitor_results where event_id = p_event and grading_version = p_version) into v_has_current;
    if not v_has_current then
      -- Carry forward the most recent prior version's RECORDED order (finishing
      -- order unchanged across the regrade). A baseline-only prior is not carried.
      select max(grading_version) into v_prior
        from event_competitor_results where event_id = p_event and grading_version < p_version and recorded = true;
      if v_prior is not null then
        insert into event_competitor_results (tenant_id, event_id, grading_version, competitor_id, finishing_position, points, recorded)
        select tenant_id, p_event, p_version, competitor_id, finishing_position, app.draft_position_points(v_comp, finishing_position), true
        from event_competitor_results where event_id = p_event and grading_version = v_prior;
      elsif v_winner is not null then
        if not coalesce(v_fallback, true) then return 'blocked'; end if;  -- require a recorded order
        insert into event_competitor_results (tenant_id, event_id, grading_version, competitor_id, finishing_position, points, recorded)
        values (p_tenant, p_event, p_version, v_winner, 1, app.draft_position_points(v_comp, 1), false);
      end if;
    end if;
  end if;

  perform app.recompute_competitor_competition_stats(p_tenant, v_comp);
  perform app.refresh_draft_leaderboard(p_tenant, v_comp);
  return 'applied';
end; $$;

-- Draft standings projection: version-aware; returns 'applied' | 'stale' | 'blocked'.
drop function if exists public.project_draft_standings(uuid, uuid, int);
create or replace function public.project_draft_standings(p_tenant uuid, p_event uuid, p_version int, p_settlement_id uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from settlements where id = p_settlement_id and event_id = p_event and status = 'active' and grading_version = p_version
  ) then return 'stale'; end if;
  return app.settle_draft_for_event(p_event, p_tenant, p_version);
end; $$;

-- ── Achievements ──────────────────────────────────────────────────────────────
-- Prerequisite check now optionally scoped to a single user (achievement depends
-- on that user's statistics projection). Drop the prior single-arg signature first
-- so a one-argument call (from project_leaderboard_scope) is unambiguous.
drop function if exists app.user_stats_prereqs(uuid);
create or replace function app.user_stats_prereqs(p_settlement_id uuid, p_user uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select case
    when count(*) = 0 then 'ready'
    when count(*) filter (where status = 'dead') > 0 then 'blocked'
    when count(*) filter (where status = 'succeeded') = count(*) then 'ready'
    else 'pending'
  end
  from system_jobs
  where job_type = 'projection.user_stats' and (payload->>'settlement_id')::uuid = p_settlement_id
    and (p_user is null or (payload->>'user_id')::uuid = p_user);
$$;

-- Evaluate achievements from CURRENT authoritative statistics. Historical
-- milestones (first_prediction, first_correct, count) are grant-only and never
-- revoked. Reversible/state-derived ones (streak, accuracy) are revoked (row +
-- audit preserved via revoked_at) when no longer met, and un-revoked if re-earned.
create or replace function app.evaluate_achievements(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record; v_correct int := 0; v_incorrect int := 0; v_total int := 0; v_best int := 0;
  v_graded int; v_earned boolean; v_has_prediction boolean; v_reversible boolean;
begin
  select correct_predictions, incorrect_predictions, total_predictions, best_streak
    into v_correct, v_incorrect, v_total, v_best
  from user_statistics where tenant_id = p_tenant and user_id = p_user;
  v_correct := coalesce(v_correct, 0); v_incorrect := coalesce(v_incorrect, 0);
  v_total := coalesce(v_total, 0); v_best := coalesce(v_best, 0);
  v_graded := v_correct + v_incorrect;
  v_has_prediction := exists (select 1 from predictions where tenant_id = p_tenant and user_id = p_user);

  for a in select * from achievements where tenant_id = p_tenant and active loop
    v_earned := case a.rule->>'type'
      when 'first_prediction' then v_has_prediction
      when 'first_correct'    then v_correct >= 1
      when 'streak'           then v_best >= (a.rule->>'threshold')::int
      when 'count'            then v_total >= (a.rule->>'threshold')::int
      when 'accuracy'         then v_graded >= coalesce((a.rule->>'minSample')::int, 0)
                                   and v_graded > 0
                                   and (v_correct::numeric / v_graded) >= (a.rule->>'threshold')::numeric
      else false
    end;
    v_reversible := (a.rule->>'type') in ('streak', 'accuracy');

    if v_earned then
      insert into user_achievements (tenant_id, user_id, achievement_id)
      values (p_tenant, p_user, a.id)
      on conflict (tenant_id, user_id, achievement_id) do update set revoked_at = null;  -- (re)grant / un-revoke
    elsif v_reversible then
      update user_achievements set revoked_at = now()
        where tenant_id = p_tenant and user_id = p_user and achievement_id = a.id and revoked_at is null;
    end if;  -- historical + not earned → preserved as-is
  end loop;
end; $$;

-- Achievements projection: version + per-user stats prerequisite. Returns
-- 'applied' | 'stale' | 'defer' | 'blocked'.
drop function if exists public.project_achievements(uuid, uuid, int, uuid);
create or replace function public.project_achievements(p_tenant uuid, p_event uuid, p_version int, p_user uuid, p_settlement_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_pre text;
begin
  if not exists (
    select 1 from settlements where id = p_settlement_id and event_id = p_event and status = 'active' and grading_version = p_version
  ) then return 'stale'; end if;
  v_pre := app.user_stats_prereqs(p_settlement_id, p_user);
  if v_pre = 'blocked' then return 'blocked'; end if;
  if v_pre = 'pending' then return 'defer'; end if;
  perform app.evaluate_achievements(p_tenant, p_user);
  return 'applied';
end; $$;

-- ── Deterministic rebuilds (rule 7; reused by §5H reconciliation) ─────────────
create or replace function public.rebuild_draft_competition(p_tenant uuid, p_competition uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  perform app.recompute_competitor_competition_stats(p_tenant, p_competition);
  perform app.refresh_draft_leaderboard(p_tenant, p_competition);
end; $$;

create or replace function public.rebuild_user_achievements(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  perform app.evaluate_achievements(p_tenant, p_user);
end; $$;

create or replace function public.rebuild_tenant_draft_standings(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  for r in select competition_id from competition_draft_settings where tenant_id = p_tenant and is_enabled loop
    perform app.recompute_competitor_competition_stats(p_tenant, r.competition_id);
    perform app.refresh_draft_leaderboard(p_tenant, r.competition_id);
  end loop;
end; $$;

revoke all on function public.project_draft_standings(uuid, uuid, int, uuid) from public;
revoke all on function public.project_achievements(uuid, uuid, int, uuid, uuid) from public;
grant execute on function public.project_draft_standings(uuid, uuid, int, uuid) to service_role;
grant execute on function public.project_achievements(uuid, uuid, int, uuid, uuid) to service_role;
revoke all on function public.rebuild_draft_competition(uuid, uuid) from public;
revoke all on function public.rebuild_user_achievements(uuid, uuid) from public;
revoke all on function public.rebuild_tenant_draft_standings(uuid) from public;
grant execute on function public.rebuild_draft_competition(uuid, uuid) to authenticated, service_role;
grant execute on function public.rebuild_user_achievements(uuid, uuid) to authenticated, service_role;
grant execute on function public.rebuild_tenant_draft_standings(uuid) to authenticated, service_role;
