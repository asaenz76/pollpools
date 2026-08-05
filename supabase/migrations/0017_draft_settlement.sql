-- ============================================================================
-- 0017_draft_settlement.sql  (Phase 4.5)
-- Draft scoring + its integration with settlement. Fully additive: a trigger on
-- `settlements` runs the draft hook whenever a settlement becomes active (covers
-- both settle and regrade), so Phase 4's settle_event/regrade_event are UNCHANGED.
-- Draft data is derived (recomputed from active results) → regrade is reversible.
-- ============================================================================

-- Points for a finishing position from the competition's draft scoring rule.
create or replace function app.draft_position_points(p_competition uuid, p_position int)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (config -> 'position_points' ->> p_position::text)::int
     from draft_scoring_rules where competition_id = p_competition limit 1),
    0);
$$;

-- Recompute competitor competition stats from ACTIVE finishing results.
create or replace function app.recompute_competitor_competition_stats(p_tenant uuid, p_competition uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from competitor_competition_stats where tenant_id = p_tenant and competition_id = p_competition;
  insert into competitor_competition_stats
    (tenant_id, competition_id, competitor_id, total_points, wins, podiums, top_finishes, events_completed, best_position, updated_at)
  select p_tenant, p_competition, ecr.competitor_id,
    coalesce(sum(ecr.points), 0),
    count(*) filter (where ecr.finishing_position = 1),
    count(*) filter (where ecr.finishing_position <= 3),
    count(*) filter (where ecr.finishing_position <= 5),
    count(*),
    min(ecr.finishing_position),
    now()
  from event_competitor_results ecr
  join settlements s on s.event_id = ecr.event_id and s.grading_version = ecr.grading_version and s.status = 'active'
  join events e on e.id = ecr.event_id and e.competition_id = p_competition
  where ecr.tenant_id = p_tenant
  group by ecr.competitor_id;
end; $$;

-- Materialize the draft leaderboard (spec §10 tie-breakers).
create or replace function app.refresh_draft_leaderboard(p_tenant uuid, p_competition uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from draft_leaderboard_snapshots where tenant_id = p_tenant and competition_id = p_competition;
  insert into draft_leaderboard_snapshots
    (tenant_id, competition_id, user_id, assignment_id, competitor_id, rank, competition_points, wins, podiums, events_completed, confirmed_at, computed_at)
  select p_tenant, p_competition, a.user_id, a.id, a.competitor_id,
    rank() over (order by
      coalesce(ccs.total_points, 0) desc,
      coalesce(ccs.wins, 0) desc,
      coalesce(ccs.podiums, 0) desc,
      coalesce(ccs.best_position, 9999) asc,
      a.confirmed_at asc nulls last,
      a.id asc),
    coalesce(ccs.total_points, 0), coalesce(ccs.wins, 0), coalesce(ccs.podiums, 0),
    coalesce(ccs.events_completed, 0), a.confirmed_at, now()
  from competitor_draft_assignments a
  left join competitor_competition_stats ccs
    on ccs.tenant_id = p_tenant and ccs.competition_id = p_competition and ccs.competitor_id = a.competitor_id
  where a.competition_id = p_competition and a.status in ('confirmed', 'active', 'completed');
end; $$;

-- The draft hook: record a baseline result (winner = position 1) and recompute.
-- No-op when the event's competition has no enabled draft → Phase 4 unaffected.
create or replace function app.settle_draft_for_event(
  p_event uuid, p_tenant uuid, p_winner uuid, p_resolution text, p_version int
)
returns void language plpgsql security definer set search_path = public as $$
declare v_comp uuid; v_enabled boolean;
begin
  select competition_id into v_comp from events where id = p_event;
  if v_comp is null then return; end if;
  select is_enabled into v_enabled from competition_draft_settings where competition_id = v_comp;
  if v_enabled is not true then return; end if;

  delete from event_competitor_results where event_id = p_event and grading_version = p_version;
  if p_resolution = 'settled' and p_winner is not null then
    insert into event_competitor_results (tenant_id, event_id, grading_version, competitor_id, finishing_position, points)
    values (p_tenant, p_event, p_version, p_winner, 1, app.draft_position_points(v_comp, 1));
  end if;

  perform app.recompute_competitor_competition_stats(p_tenant, v_comp);
  perform app.refresh_draft_leaderboard(p_tenant, v_comp);
end; $$;

-- Trigger: fire the draft hook when a settlement becomes active (settle/regrade).
create or replace function app.on_settlement_activated()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_winner uuid; v_resolution text;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select winning_competitor_id, resolution into v_winner, v_resolution
      from event_results where event_id = new.event_id and grading_version = new.grading_version;
    perform app.settle_draft_for_event(new.event_id, new.tenant_id, v_winner, v_resolution, new.grading_version);
  end if;
  return new;
end; $$;

create trigger trg_on_settlement_activated
  after update on settlements
  for each row execute function app.on_settlement_activated();

-- Record full finishing positions for the active grading version (creator/admin).
-- Enriches the winner-only baseline with a complete finishing order.
create or replace function public.record_event_positions(p_event_id uuid, p_positions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype; v_version int; v_comp uuid; v_pos jsonb; v_count int := 0;
begin
  if not app.can_settle_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_event from events where id = p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_comp := v_event.competition_id;

  select grading_version into v_version from settlements where event_id = p_event_id and status = 'active';
  if v_version is null then raise exception 'NOT_SETTLED' using errcode = '22000'; end if;

  delete from event_competitor_results where event_id = p_event_id and grading_version = v_version;
  for v_pos in select * from jsonb_array_elements(p_positions) loop
    insert into event_competitor_results (tenant_id, event_id, grading_version, competitor_id, finishing_position, points)
    values (v_event.tenant_id, p_event_id, v_version, (v_pos->>'competitor_id')::uuid, (v_pos->>'position')::int,
            app.draft_position_points(v_comp, (v_pos->>'position')::int));
    v_count := v_count + 1;
  end loop;

  perform app.recompute_competitor_competition_stats(v_event.tenant_id, v_comp);
  perform app.refresh_draft_leaderboard(v_event.tenant_id, v_comp);
  return jsonb_build_object('event_id', p_event_id, 'grading_version', v_version, 'recorded', v_count);
end; $$;

-- Award prizes to draft standings by placement. Idempotent (never duplicates).
create or replace function public.award_competition_prizes(p_competition_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_comp competitions%rowtype; v_count int := 0; r record;
begin
  select * into v_comp from competitions where id = p_competition_id;
  if not found then raise exception 'COMPETITION_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (app.is_super_admin() or app.owns_competition(p_competition_id) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  for r in
    select pz.id as prize_id, dl.user_id, dl.assignment_id
    from competition_prizes pz
    join draft_leaderboard_snapshots dl
      on dl.competition_id = p_competition_id and dl.rank is not null
     and dl.rank >= coalesce(pz.placement_from, 1)
     and dl.rank <= coalesce(pz.placement_to, pz.placement_from, 2147483647)
    where pz.competition_id = p_competition_id and pz.placement_from is not null
  loop
    insert into prize_awards (tenant_id, competition_prize_id, user_id, draft_assignment_id, status, idempotency_key)
    values (v_comp.tenant_id, r.prize_id, r.user_id, r.assignment_id, 'awarded',
            'prize:' || r.prize_id::text || ':' || r.user_id::text)
    on conflict (idempotency_key) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end; $$;

revoke all on function public.record_event_positions(uuid, jsonb) from public;
grant execute on function public.record_event_positions(uuid, jsonb) to authenticated, service_role;
revoke all on function public.award_competition_prizes(uuid) from public;
grant execute on function public.award_competition_prizes(uuid) to authenticated, service_role;
