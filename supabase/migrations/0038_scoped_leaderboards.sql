-- ============================================================================
-- 0038 — Phase 7.5 §5 (D): scoped + incremental leaderboard refresh (F-05).
--
-- Four leaderboard scopes, kept separate: tenant global, creator, competition,
-- and season (a SEASON is a competition with type='SEASON' — the existing model,
-- not a new table). A settlement refreshes ONLY the scopes its event touches:
--   global (always) + creator (always) + (competition XOR season) when the event
--   has a competition. Unrelated creators/competitions/seasons are never rebuilt.
--
-- LEADERBOARD MODEL: the "latest" leaderboard is a MUTABLE projection row per
-- (tenant, scope, scope_id, period='all_time', user), refreshed in place (delete
-- + reinsert for that scope only). The `period` column exists for future periodic
-- IMMUTABLE snapshots, but none are produced today, so nothing immutable is
-- mutated or deleted.
--
-- ORDERING: global and competition leaderboards rank from the maintained stats
-- tables (user_statistics / competition_statistics), so their jobs must run AFTER
-- the affected users' stats jobs. This is guaranteed deterministically (not by
-- timing): jobs carry a monotonic `seq` and the worker processes each claimed
-- batch in seq order; enqueue writes stats jobs before leaderboard jobs.
-- ============================================================================

-- Monotonic enqueue order → deterministic FIFO processing within a claimed batch.
alter table system_jobs add column if not exists seq bigserial;

create or replace function public.claim_jobs(p_limit int default 10, p_tenant uuid default null)
returns setof system_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  with claimed as (
    update system_jobs j set status = 'running', started_at = now(), attempts = attempts + 1
    where j.id in (
      select c.id from system_jobs c
      where c.status = 'pending' and c.run_at <= now()
        and (p_tenant is null or c.tenant_id = p_tenant)
      order by c.run_at, c.seq
      for update skip locked
      limit greatest(p_limit, 1)
    )
    returning j.*
  )
  select * from claimed order by seq;  -- FIFO: stats jobs (lower seq) before leaderboard jobs
end; $$;
revoke all on function public.claim_jobs(int, uuid) from public;
grant execute on function public.claim_jobs(int, uuid) to service_role;

-- ── Shared ranking note ───────────────────────────────────────────────────────
-- All scopes rank deterministically: total_points desc, accuracy desc, correct
-- desc, earliest first-graded time, then stable user id. Users with fewer graded
-- predictions than the tenant minimum are kept but left unranked (rank null,
-- ranked=false).

-- Creator scope: aggregate the creator's events' active grades directly (no
-- creator_statistics table needed; bounded by the creator's own participation).
create or replace function app.refresh_creator_leaderboard(p_tenant uuid, p_creator uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_min int;
begin
  select coalesce(minimum_ranked_predictions, 5) into v_min from tenant_settings where tenant_id = p_tenant;
  v_min := coalesce(v_min, 5);

  delete from leaderboard_snapshots where tenant_id = p_tenant and scope = 'creator' and scope_id = p_creator and period = 'all_time';

  insert into leaderboard_snapshots
    (tenant_id, scope, scope_id, period, user_id, rank, total_points, correct_predictions, accuracy, ranked, computed_at)
  with agg as (
    select g.user_id,
      coalesce(sum(g.points), 0) as total_points,
      count(*) filter (where g.outcome = 'correct') as correct,
      count(*) filter (where g.outcome = 'incorrect') as incorrect,
      min(coalesce(e.starts_at, s.activated_at)) as first_graded_at
    from settlement_grades g
    join settlements s on s.id = g.settlement_id and s.status = 'active'
    join events e on e.id = g.event_id
    where g.tenant_id = p_tenant and e.creator_id = p_creator
    group by g.user_id
  )
  select p_tenant, 'creator', p_creator, 'all_time', a.user_id,
    case when (a.correct + a.incorrect) >= v_min then
      rank() over (partition by ((a.correct + a.incorrect) >= v_min)
        order by a.total_points desc,
          (case when (a.correct + a.incorrect) > 0 then a.correct::numeric / (a.correct + a.incorrect) else 0 end) desc,
          a.correct desc, a.first_graded_at asc nulls last, a.user_id asc)
    else null end,
    a.total_points, a.correct,
    case when (a.correct + a.incorrect) > 0 then round(a.correct::numeric / (a.correct + a.incorrect), 4) else 0 end,
    (a.correct + a.incorrect) >= v_min, now()
  from agg a
  where (a.correct + a.incorrect) > 0;
end; $$;

-- Competition/season scope: rank from the maintained competition_statistics.
create or replace function app.refresh_competition_leaderboard(p_tenant uuid, p_competition uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_min int; v_scope leaderboard_scope; v_type competition_type;
begin
  select coalesce(minimum_ranked_predictions, 5) into v_min from tenant_settings where tenant_id = p_tenant;
  v_min := coalesce(v_min, 5);
  select type into v_type from competitions where id = p_competition;
  if v_type is null then return; end if;
  v_scope := case when v_type = 'SEASON' then 'season'::leaderboard_scope else 'competition'::leaderboard_scope end;

  delete from leaderboard_snapshots where tenant_id = p_tenant and scope = v_scope and scope_id = p_competition and period = 'all_time';

  insert into leaderboard_snapshots
    (tenant_id, scope, scope_id, period, user_id, rank, total_points, correct_predictions, accuracy, ranked, computed_at)
  select p_tenant, v_scope, p_competition, 'all_time', cs.user_id,
    case when (cs.correct_predictions + cs.incorrect_predictions) >= v_min then
      rank() over (partition by ((cs.correct_predictions + cs.incorrect_predictions) >= v_min)
        order by cs.total_points desc,
          (case when (cs.correct_predictions + cs.incorrect_predictions) > 0
                then cs.correct_predictions::numeric / (cs.correct_predictions + cs.incorrect_predictions) else 0 end) desc,
          cs.correct_predictions desc, cs.first_graded_at asc nulls last, cs.user_id asc)
    else null end,
    cs.total_points, cs.correct_predictions,
    case when (cs.correct_predictions + cs.incorrect_predictions) > 0
         then round(cs.correct_predictions::numeric / (cs.correct_predictions + cs.incorrect_predictions), 4) else 0 end,
    (cs.correct_predictions + cs.incorrect_predictions) >= v_min, now()
  from competition_statistics cs
  where cs.tenant_id = p_tenant and cs.competition_id = p_competition and (cs.correct_predictions + cs.incorrect_predictions) > 0;
end; $$;

-- ── Version- and scope-aware leaderboard projection ───────────────────────────
drop function if exists public.project_leaderboard(uuid, uuid, int);
create or replace function public.project_leaderboard_scope(
  p_tenant uuid, p_event uuid, p_version int, p_settlement_id uuid, p_scope text, p_scope_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  -- Stale / not the active settlement for this version → no-op.
  if not exists (
    select 1 from settlements where id = p_settlement_id and event_id = p_event and status = 'active' and grading_version = p_version
  ) then return false; end if;

  -- The event must actually belong to the requested scope (rule 9).
  v_ok := case p_scope
    when 'global' then true
    when 'creator' then exists (select 1 from events where id = p_event and creator_id = p_scope_id)
    when 'competition' then exists (select 1 from events where id = p_event and competition_id = p_scope_id)
    when 'season' then exists (select 1 from events where id = p_event and competition_id = p_scope_id)
    else false end;
  if not v_ok then raise exception 'EVENT_NOT_IN_SCOPE' using errcode = '22000'; end if;

  case p_scope
    when 'global' then perform app.refresh_global_leaderboard(p_tenant);
    when 'creator' then perform app.refresh_creator_leaderboard(p_tenant, p_scope_id);
    else perform app.refresh_competition_leaderboard(p_tenant, p_scope_id);  -- competition | season
  end case;
  return true;
end; $$;

-- ── Enqueue one leaderboard job PER affected scope (separate, isolated) ────────
create or replace function app.enqueue_settlement_projections(p_tenant uuid, p_event uuid, p_settlement_id uuid, p_version int)
returns void language plpgsql security definer set search_path = public as $$
declare v_comp uuid; v_creator uuid; v_comp_type competition_type; v_comp_scope text; u record;
  base jsonb;
begin
  select competition_id, creator_id into v_comp, v_creator from events where id = p_event;
  base := jsonb_build_object('event_id', p_event, 'settlement_id', p_settlement_id, 'grading_version', p_version, 'tenant_id', p_tenant);

  -- Per affected user: statistics/streaks and achievements (enqueued FIRST → run
  -- before leaderboard jobs, which rank from the maintained stats).
  for u in select distinct user_id from settlement_grades where settlement_id = p_settlement_id loop
    perform public.enqueue_job(p_tenant, 'projection.user_stats',
      base || jsonb_build_object('user_id', u.user_id), 'stats:' || p_settlement_id::text || ':' || u.user_id::text);
    perform public.enqueue_job(p_tenant, 'projection.achievements',
      base || jsonb_build_object('user_id', u.user_id), 'ach:' || p_settlement_id::text || ':' || u.user_id::text);
  end loop;

  -- One leaderboard job per affected scope (distinct dedup keys → isolated retries).
  perform public.enqueue_job(p_tenant, 'projection.leaderboard',
    base || jsonb_build_object('scope', 'global'),
    'leaderboard:' || p_tenant::text || ':global:' || p_settlement_id::text);
  perform public.enqueue_job(p_tenant, 'projection.leaderboard',
    base || jsonb_build_object('scope', 'creator', 'scope_id', v_creator),
    'leaderboard:' || p_tenant::text || ':creator:' || v_creator::text || ':' || p_settlement_id::text);
  if v_comp is not null then
    select type into v_comp_type from competitions where id = v_comp;
    v_comp_scope := case when v_comp_type = 'SEASON' then 'season' else 'competition' end;
    perform public.enqueue_job(p_tenant, 'projection.leaderboard',
      base || jsonb_build_object('scope', v_comp_scope, 'scope_id', v_comp),
      'leaderboard:' || p_tenant::text || ':' || v_comp_scope || ':' || v_comp::text || ':' || p_settlement_id::text);
  end if;

  -- Draft standings, feed, notifications (one each).
  perform public.enqueue_job(p_tenant, 'projection.draft_standings',
    base || jsonb_build_object('competition_id', v_comp), 'draft:' || p_settlement_id::text);
  perform public.enqueue_job(p_tenant, 'projection.feed', base, 'feed:' || p_settlement_id::text);
  perform public.enqueue_job(p_tenant, 'projection.notify_settlement', base, 'notify:' || p_settlement_id::text);
end; $$;

-- ── Deterministic full rebuilds (rule 16; reused by §5H reconciliation) ───────
create or replace function public.rebuild_leaderboard_scope(p_tenant uuid, p_scope_type text, p_scope_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  case p_scope_type
    when 'global' then perform app.refresh_global_leaderboard(p_tenant);
    when 'creator' then perform app.refresh_creator_leaderboard(p_tenant, p_scope_id);
    when 'competition' then perform app.refresh_competition_leaderboard(p_tenant, p_scope_id);
    when 'season' then perform app.refresh_competition_leaderboard(p_tenant, p_scope_id);
    else raise exception 'UNKNOWN_SCOPE' using errcode = '22000';
  end case;
end; $$;

-- Full-tenant rebuild — NEVER called by the normal settlement path.
create or replace function public.rebuild_tenant_leaderboards(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform app.refresh_global_leaderboard(p_tenant);
  for r in select id from creators where tenant_id = p_tenant loop
    perform app.refresh_creator_leaderboard(p_tenant, r.id);
  end loop;
  for r in select id from competitions where tenant_id = p_tenant loop
    perform app.refresh_competition_leaderboard(p_tenant, r.id);
  end loop;
end; $$;

revoke all on function public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid) from public;
grant execute on function public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid) to service_role;
revoke all on function public.rebuild_leaderboard_scope(uuid, text, uuid) from public;
grant execute on function public.rebuild_leaderboard_scope(uuid, text, uuid) to authenticated, service_role;
revoke all on function public.rebuild_tenant_leaderboards(uuid) from public;
grant execute on function public.rebuild_tenant_leaderboards(uuid) to authenticated, service_role;
