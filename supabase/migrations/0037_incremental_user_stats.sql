-- ============================================================================
-- 0037 — Phase 7.5 §5 (C): incremental user statistics + streak projections.
--
-- Statistics are derived ONLY from authoritative active settlement grades, and
-- recomputed per affected user (never a whole-tenant rebuild — §5B enqueues one
-- job per affected user). This slice makes the recompute deterministic and
-- regrade-safe, and adds the administrative single-user rebuild that §5H's
-- reconciliation will reuse.
--
-- STREAK CHRONOLOGY (the key correctness rule). A streak is sequence-dependent,
-- so it is recomputed from the user's active grades in a STABLE chronological
-- order, never by ±1/reset mutation. Ordering key, most significant first:
--   1. event start time            (events.starts_at — the event's occurrence;
--                                    the schema records no separate "completed_at",
--                                    so start is the chronological anchor. A
--                                    vertical that records a real completion time
--                                    in metadata could layer it in above this.)
--   2. active settlement activation (settlements.activated_at — fallback when an
--                                    event has no start time)
--   3. event id                     (stable, deterministic tiebreak for identical
--                                    timestamps — REGRADE-INVARIANT, unlike the
--                                    previous grade-created-at tiebreak which
--                                    changed on every regrade)
-- Void/canceled outcomes never extend or break a streak.
-- ============================================================================

alter table user_statistics add column if not exists voided_predictions integer not null default 0;

-- Deterministic per-user recompute from active grades. This is THE single-user
-- rebuild logic; both the projection job and the admin/reconciliation rebuild
-- call it, so incremental and full-rebuild results are identical by construction.
create or replace function app.recompute_user_statistics(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total int := 0; v_correct int := 0; v_incorrect int := 0; v_voided int := 0; v_points int := 0;
  v_current int := 0; v_best int := 0;
  v_first timestamptz; v_last timestamptz;
  r record;
begin
  for r in
    select g.outcome, g.points, coalesce(e.starts_at, s.activated_at) as at
    from settlement_grades g
    join settlements s on s.id = g.settlement_id and s.status = 'active'
    join events e on e.id = g.event_id
    where g.tenant_id = p_tenant and g.user_id = p_user
    -- Stable, regrade-invariant streak ordering (see header): start → activation → event id.
    order by coalesce(e.starts_at, s.activated_at) asc nulls last, e.id asc
  loop
    v_points := v_points + r.points;
    if r.outcome = 'correct' then
      v_total := v_total + 1; v_correct := v_correct + 1;
      v_current := v_current + 1;
      if v_current > v_best then v_best := v_current; end if;
    elsif r.outcome = 'incorrect' then
      v_total := v_total + 1; v_incorrect := v_incorrect + 1;
      v_current := 0;                       -- incorrect resets the streak
    else
      v_voided := v_voided + 1;             -- void/canceled: tracked, but no streak effect
    end if;
    if v_first is null then v_first := r.at; end if;
    v_last := r.at;
  end loop;

  insert into user_statistics as us
    (tenant_id, user_id, total_predictions, correct_predictions, incorrect_predictions, voided_predictions,
     total_points, current_streak, best_streak, first_graded_at, last_graded_at, updated_at)
  values (p_tenant, p_user, v_total, v_correct, v_incorrect, v_voided, v_points, v_current, v_best, v_first, v_last, now())
  on conflict (tenant_id, user_id) do update set
    total_predictions = excluded.total_predictions,
    correct_predictions = excluded.correct_predictions,
    incorrect_predictions = excluded.incorrect_predictions,
    voided_predictions = excluded.voided_predictions,
    total_points = excluded.total_points,
    current_streak = excluded.current_streak,
    best_streak = excluded.best_streak,
    first_graded_at = excluded.first_graded_at,
    last_graded_at = excluded.last_graded_at,
    updated_at = now();

  -- Per-competition stats (for competition/season leaderboards).
  delete from competition_statistics where tenant_id = p_tenant and user_id = p_user;
  insert into competition_statistics
    (tenant_id, competition_id, user_id, total_points, correct_predictions, incorrect_predictions, first_graded_at, updated_at)
  select p_tenant, e.competition_id, p_user, coalesce(sum(g.points), 0),
    count(*) filter (where g.outcome = 'correct'),
    count(*) filter (where g.outcome = 'incorrect'),
    min(coalesce(e.starts_at, s.activated_at)), now()
  from settlement_grades g
  join settlements s on s.id = g.settlement_id and s.status = 'active'
  join events e on e.id = g.event_id
  where g.tenant_id = p_tenant and g.user_id = p_user and e.competition_id is not null
  group by e.competition_id;
end; $$;

-- Administrative single-user rebuild (rule 11). §5H reconciliation reuses this.
create or replace function public.rebuild_user_statistics(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform app.recompute_user_statistics(p_tenant, p_user);
end; $$;

-- The stats projection job now also verifies the settlement id (rule 9): recompute
-- only when THIS settlement is the active one for the event at this version.
drop function if exists public.project_user_stats(uuid, uuid, int, uuid);
create or replace function public.project_user_stats(p_tenant uuid, p_event uuid, p_version int, p_user uuid, p_settlement_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from settlements
    where id = p_settlement_id and event_id = p_event and status = 'active' and grading_version = p_version
  ) then
    return false;  -- superseded / not the active settlement → stale, no-op
  end if;
  perform app.recompute_user_statistics(p_tenant, p_user);
  return true;
end; $$;

revoke all on function public.rebuild_user_statistics(uuid, uuid) from public;
grant execute on function public.rebuild_user_statistics(uuid, uuid) to authenticated, service_role;
revoke all on function public.project_user_stats(uuid, uuid, int, uuid, uuid) from public;
grant execute on function public.project_user_stats(uuid, uuid, int, uuid, uuid) to service_role;
