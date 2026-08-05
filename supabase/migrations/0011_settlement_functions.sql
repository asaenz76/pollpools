-- ============================================================================
-- 0011_settlement_functions.sql
-- The settlement engine. settle_event / regrade_event are the only entry points;
-- both are atomic, idempotent, and versioned. Derived statistics are recomputed
-- from the active grades (never incremented in place), which makes settle, void,
-- and regrade all correct and reversible.
-- ============================================================================

-- ── Recompute one user's derived statistics from their ACTIVE grades ────────
create or replace function app.recompute_user_statistics(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total int := 0; v_correct int := 0; v_incorrect int := 0; v_points int := 0;
  v_current int := 0; v_best int := 0;
  v_first timestamptz; v_last timestamptz;
  r record;
begin
  for r in
    select g.outcome, g.points, coalesce(e.starts_at, g.created_at) as at
    from settlement_grades g
    join settlements s on s.id = g.settlement_id and s.status = 'active'
    join events e on e.id = g.event_id
    where g.tenant_id = p_tenant and g.user_id = p_user
    order by coalesce(e.starts_at, g.created_at), g.created_at
  loop
    v_points := v_points + r.points;
    if r.outcome = 'correct' then
      v_total := v_total + 1; v_correct := v_correct + 1;
      v_current := v_current + 1;
      if v_current > v_best then v_best := v_current; end if;
    elsif r.outcome = 'incorrect' then
      v_total := v_total + 1; v_incorrect := v_incorrect + 1;
      v_current := 0;                       -- incorrect resets the streak
    end if;                                 -- void: no effect
    if v_first is null then v_first := r.at; end if;
    v_last := r.at;
  end loop;

  insert into user_statistics as us
    (tenant_id, user_id, total_predictions, correct_predictions, incorrect_predictions,
     total_points, current_streak, best_streak, first_graded_at, last_graded_at, updated_at)
  values (p_tenant, p_user, v_total, v_correct, v_incorrect, v_points, v_current, v_best, v_first, v_last, now())
  on conflict (tenant_id, user_id) do update set
    total_predictions = excluded.total_predictions,
    correct_predictions = excluded.correct_predictions,
    incorrect_predictions = excluded.incorrect_predictions,
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
    min(coalesce(e.starts_at, g.created_at)), now()
  from settlement_grades g
  join settlements s on s.id = g.settlement_id and s.status = 'active'
  join events e on e.id = g.event_id
  where g.tenant_id = p_tenant and g.user_id = p_user and e.competition_id is not null
  group by e.competition_id;
end; $$;

-- ── Grant newly-earned achievements (idempotent; never duplicates) ──────────
create or replace function app.evaluate_achievements(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_correct int := 0; v_incorrect int := 0; v_total int := 0; v_best int := 0;
  v_graded int; v_earned boolean; v_has_prediction boolean;
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
      else false  -- season_champion / creator_champion granted on leaderboard finalize
    end;
    if v_earned then
      insert into user_achievements (tenant_id, user_id, achievement_id)
      values (p_tenant, p_user, a.id)
      on conflict (tenant_id, user_id, achievement_id) do nothing;
    end if;
  end loop;
end; $$;

-- ── Materialize the global leaderboard from user_statistics ─────────────────
create or replace function app.refresh_global_leaderboard(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_min int;
begin
  select coalesce(minimum_ranked_predictions, 5) into v_min from tenant_settings where tenant_id = p_tenant;
  v_min := coalesce(v_min, 5);

  delete from leaderboard_snapshots where tenant_id = p_tenant and scope = 'global' and period = 'all_time';

  insert into leaderboard_snapshots
    (tenant_id, scope, scope_id, period, user_id, rank, total_points, correct_predictions, accuracy, ranked, computed_at)
  select p_tenant, 'global', null, 'all_time', us.user_id,
    case when (us.correct_predictions + us.incorrect_predictions) >= v_min then
      rank() over (
        partition by ((us.correct_predictions + us.incorrect_predictions) >= v_min)
        order by us.total_points desc,
          (case when (us.correct_predictions + us.incorrect_predictions) > 0
                then us.correct_predictions::numeric / (us.correct_predictions + us.incorrect_predictions)
                else 0 end) desc,
          us.correct_predictions desc, us.first_graded_at asc nulls last, us.user_id asc)
    else null end,
    us.total_points, us.correct_predictions,
    case when (us.correct_predictions + us.incorrect_predictions) > 0
         then round(us.correct_predictions::numeric / (us.correct_predictions + us.incorrect_predictions), 4)
         else 0 end,
    (us.correct_predictions + us.incorrect_predictions) >= v_min,
    now()
  from user_statistics us
  where us.tenant_id = p_tenant and (us.correct_predictions + us.incorrect_predictions) > 0;
end; $$;

-- ── Grade every prediction on an event for a settlement version ─────────────
create or replace function app.apply_grading(
  p_settlement_id uuid, p_event_id uuid, p_version int, p_resolution text,
  p_winner uuid, p_tenant uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_market record; v_pred record; v_win_option uuid; v_outcome text; v_points int;
begin
  for v_market in select * from markets where event_id = p_event_id loop
    v_win_option := null;
    if p_resolution = 'settled' then
      select id into v_win_option from market_options
        where market_id = v_market.id and competitor_id = p_winner limit 1;
      update market_options
        set status = (case when id = v_win_option then 'winner' else 'loser' end)::option_status
        where market_id = v_market.id;
      update markets set status = 'settled' where id = v_market.id;
    else
      update market_options set status = 'voided' where market_id = v_market.id;
      update markets
        set status = (case when p_resolution = 'canceled' then 'canceled' else 'voided' end)::market_status
        where id = v_market.id;
    end if;

    for v_pred in select * from predictions where market_id = v_market.id loop
      if p_resolution <> 'settled' or v_win_option is null then
        v_outcome := 'void'; v_points := 0;
      elsif v_pred.option_id = v_win_option then
        v_outcome := 'correct'; v_points := 1;
      else
        v_outcome := 'incorrect'; v_points := 0;
      end if;

      insert into settlement_grades
        (tenant_id, settlement_id, event_id, grading_version, prediction_id, user_id, market_id, option_id, outcome, points)
      values (p_tenant, p_settlement_id, p_event_id, p_version, v_pred.id, v_pred.user_id, v_market.id, v_pred.option_id, v_outcome, v_points);

      update predictions
        set status = v_outcome::prediction_status, locked_at = coalesce(locked_at, now())
        where id = v_pred.id;
    end loop;
  end loop;
end; $$;

-- ── Recompute stats/achievements/leaderboard for everyone on an event ───────
create or replace function app.recompute_after_settlement(p_event_id uuid, p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u record;
begin
  for u in
    select distinct g.user_id from settlement_grades g
    join settlements s on s.id = g.settlement_id and s.status = 'active'
    where g.event_id = p_event_id
  loop
    perform app.recompute_user_statistics(p_tenant, u.user_id);
    perform app.evaluate_achievements(p_tenant, u.user_id);
  end loop;
  perform app.refresh_global_leaderboard(p_tenant);
end; $$;

-- ── Authorization: super admin, or a creator granted settlement on their own
--    event, or the trusted service role ──────────────────────────────────────
create or replace function app.can_settle_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_super_admin()
    or coalesce(auth.role(), '') = 'service_role'
    or exists (
      select 1 from events e join creators c on c.id = e.creator_id
      where e.id = p_event_id and c.owner_user_id = auth.uid() and c.settlement_enabled = true
    );
$$;

-- ── settle_event: first settlement of an event ──────────────────────────────
create or replace function public.settle_event(
  p_event_id uuid,
  p_resolution text,
  p_winning_competitor_id uuid,
  p_notes text,
  p_result_url text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_tenant uuid; v_version int; v_result_id uuid; v_settlement_id uuid;
  v_graded int; v_prior jsonb; v_result jsonb;
begin
  if not app.can_settle_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_resolution not in ('settled', 'voided', 'canceled') then raise exception 'INVALID_RESOLUTION' using errcode = '22000'; end if;

  select response into v_prior from idempotency_records where scope = 'settlement' and idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_tenant := v_event.tenant_id;

  if exists (select 1 from settlements where event_id = p_event_id and status = 'active') then
    raise exception 'ALREADY_SETTLED' using errcode = '23505';  -- use regrade_event
  end if;

  if p_resolution = 'settled' then
    if p_winning_competitor_id is null then raise exception 'WINNER_REQUIRED' using errcode = '22000'; end if;
    if not exists (
      select 1 from market_options mo join markets m on m.id = mo.market_id
      where m.event_id = p_event_id and mo.competitor_id = p_winning_competitor_id
    ) then raise exception 'INVALID_WINNER' using errcode = '22000'; end if;
  end if;

  v_version := coalesce((select max(grading_version) from settlements where event_id = p_event_id), 0) + 1;

  insert into event_results (tenant_id, event_id, grading_version, source, resolution, winning_competitor_id, notes, result_url, submitted_by)
  values (v_tenant, p_event_id, v_version, v_event.result_source, p_resolution, p_winning_competitor_id, p_notes, p_result_url, auth.uid())
  returning id into v_result_id;

  insert into settlements (tenant_id, event_id, grading_version, status, result_id, initiated_by)
  values (v_tenant, p_event_id, v_version, 'pending', v_result_id, auth.uid())
  returning id into v_settlement_id;

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, p_winning_competitor_id, v_tenant);

  update settlements set status = 'active', activated_at = now() where id = v_settlement_id;

  update events
    set status = case p_resolution when 'settled' then 'settled'::event_status
                                   when 'voided' then 'voided'::event_status
                                   else 'canceled'::event_status end,
        settlement_status = 'active'
    where id = p_event_id;

  perform app.recompute_after_settlement(p_event_id, v_tenant);

  if p_resolution = 'settled' and p_winning_competitor_id is not null then
    perform public.advance_bracket(p_event_id, p_winning_competitor_id);
  end if;

  select count(*) into v_graded from settlement_grades where settlement_id = v_settlement_id;
  perform app.write_audit('event.settle', 'event', p_event_id, v_tenant, auth.uid(),
    format('Settled v%s (%s)', v_version, p_resolution),
    jsonb_build_object('grading_version', v_version, 'resolution', p_resolution, 'graded', v_graded));

  v_result := jsonb_build_object('event_id', p_event_id, 'grading_version', v_version, 'status', 'active', 'resolution', p_resolution, 'graded', v_graded);
  insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
    values (v_tenant, 'settlement', p_idempotency_key, v_result, 'completed')
    on conflict (scope, idempotency_key) do nothing;
  return v_result;
end; $$;

-- ── regrade_event: supersede the active settlement with a corrected version ─
create or replace function public.regrade_event(
  p_event_id uuid,
  p_resolution text,
  p_winning_competitor_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_tenant uuid; v_version int; v_result_id uuid; v_settlement_id uuid; v_old_id uuid;
  v_graded int; v_prior jsonb; v_result jsonb;
begin
  if not app.can_settle_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_resolution not in ('settled', 'voided', 'canceled') then raise exception 'INVALID_RESOLUTION' using errcode = '22000'; end if;

  select response into v_prior from idempotency_records where scope = 'settlement' and idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_tenant := v_event.tenant_id;

  select id into v_old_id from settlements where event_id = p_event_id and status = 'active';
  if v_old_id is null then raise exception 'NOT_SETTLED' using errcode = '22000'; end if;  -- nothing to regrade

  if p_resolution = 'settled' then
    if p_winning_competitor_id is null then raise exception 'WINNER_REQUIRED' using errcode = '22000'; end if;
    if not exists (
      select 1 from market_options mo join markets m on m.id = mo.market_id
      where m.event_id = p_event_id and mo.competitor_id = p_winning_competitor_id
    ) then raise exception 'INVALID_WINNER' using errcode = '22000'; end if;
  end if;

  -- Supersede the old version (immutable — we never edit/delete its grades).
  update settlements set status = 'superseded', reversed_at = now() where id = v_old_id;

  v_version := coalesce((select max(grading_version) from settlements where event_id = p_event_id), 0) + 1;

  insert into event_results (tenant_id, event_id, grading_version, source, resolution, winning_competitor_id, notes, result_url, submitted_by)
  values (v_tenant, p_event_id, v_version, 'super_admin_manual', p_resolution, p_winning_competitor_id, p_reason, null, auth.uid())
  returning id into v_result_id;

  insert into settlements (tenant_id, event_id, grading_version, status, result_id, initiated_by, reason)
  values (v_tenant, p_event_id, v_version, 'pending', v_result_id, auth.uid(), p_reason)
  returning id into v_settlement_id;

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, p_winning_competitor_id, v_tenant);

  update settlements set status = 'active', activated_at = now() where id = v_settlement_id;

  update events
    set status = case p_resolution when 'settled' then 'settled'::event_status
                                   when 'voided' then 'voided'::event_status
                                   else 'canceled'::event_status end
    where id = p_event_id;

  perform app.recompute_after_settlement(p_event_id, v_tenant);

  if p_resolution = 'settled' and p_winning_competitor_id is not null then
    perform public.advance_bracket(p_event_id, p_winning_competitor_id);
  end if;

  select count(*) into v_graded from settlement_grades where settlement_id = v_settlement_id;
  perform app.write_audit('event.regrade', 'event', p_event_id, v_tenant, auth.uid(),
    format('Regraded to v%s (%s)', v_version, p_resolution),
    jsonb_build_object('grading_version', v_version, 'resolution', p_resolution, 'reason', p_reason, 'graded', v_graded));

  v_result := jsonb_build_object('event_id', p_event_id, 'grading_version', v_version, 'status', 'active', 'resolution', p_resolution, 'graded', v_graded, 'superseded', v_old_id);
  insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
    values (v_tenant, 'settlement', p_idempotency_key, v_result, 'completed')
    on conflict (scope, idempotency_key) do nothing;
  return v_result;
end; $$;

-- Grants: entry points authorize internally; keep them off `public`/`anon`.
revoke all on function public.settle_event(uuid, text, uuid, text, text, text) from public;
grant execute on function public.settle_event(uuid, text, uuid, text, text, text) to authenticated, service_role;
revoke all on function public.regrade_event(uuid, text, uuid, text, text) from public;
grant execute on function public.regrade_event(uuid, text, uuid, text, text) to authenticated, service_role;
