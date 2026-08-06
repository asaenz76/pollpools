-- ============================================================================
-- 0036 — Phase 7.5 §5 (B): settlement enqueue integration.
--
-- The synchronous settlement transaction stays authoritative: it validates,
-- locks, creates the grading version, resolves winning options, persists the
-- immutable grades, selects the active settlement, and commits. It no longer
-- recomputes derived projections inline. Instead it ENQUEUES small, version-aware
-- projection jobs IN THE SAME TRANSACTION (a transactional outbox — the jobs are
-- rows committed atomically with the grades, so a committed settlement can never
-- silently lose its projection work).
--
-- Each projection function checks the event's ACTIVE settlement version and
-- no-ops if the job's version is stale (superseded by a regrade), so an old
-- version's job can never overwrite the active version's projections. (The
-- underlying recompute already rebuilds from the active grade set, so this is
-- both an efficiency and an observability guarantee, not the sole safeguard.)
-- ============================================================================

-- ── Version-aware projection functions (service-role; called by job handlers) ─
-- Each returns true if applied, false if the job's version is no longer active.

create or replace function app.projection_version_active(p_event uuid, p_version int)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from settlements where event_id = p_event and status = 'active' and grading_version = p_version);
$$;

create or replace function public.project_user_stats(p_tenant uuid, p_event uuid, p_version int, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  perform app.recompute_user_statistics(p_tenant, p_user);  -- rebuilds stats + streaks from active grades
  return true;
end; $$;

create or replace function public.project_achievements(p_tenant uuid, p_event uuid, p_version int, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  perform app.evaluate_achievements(p_tenant, p_user);
  return true;
end; $$;

create or replace function public.project_leaderboard(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  perform app.refresh_global_leaderboard(p_tenant);  -- scoped refresh lands in sub-slice D
  return true;
end; $$;

create or replace function public.project_draft_standings(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_winner uuid; v_resolution text;
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  select winning_competitor_id, resolution into v_winner, v_resolution
    from event_results where event_id = p_event and grading_version = p_version;
  perform app.settle_draft_for_event(p_event, p_tenant, v_winner, v_resolution, p_version);
  return true;
end; $$;

create or replace function public.project_settlement_feed(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_title text;
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  select creator_id, title into v_creator, v_title from events where id = p_event;
  perform app.emit_feed(p_tenant, 'event_settled', 'settled:' || p_event::text || ':' || p_version::text,
    null, v_creator, null, p_event, null, jsonb_build_object('title', v_title));
  return true;
end; $$;

create or replace function public.project_settlement_notifications(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
declare g record; v_title text;
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  select title into v_title from events where id = p_event;
  for g in
    select prediction_id, user_id, outcome from settlement_grades
    where event_id = p_event and grading_version = p_version and outcome in ('correct', 'incorrect')
  loop
    perform app.emit_notification(p_tenant, g.user_id,
      (case when g.outcome = 'correct' then 'prediction_correct' else 'prediction_incorrect' end)::notification_type,
      (case when g.outcome = 'correct' then 'Correct prediction' else 'Prediction missed' end),
      v_title, 'event', p_event,
      'pred:' || g.prediction_id::text || ':' || p_version::text,
      jsonb_build_object('outcome', g.outcome));
  end loop;
  return true;
end; $$;

-- ── Transactional outbox: enqueue the projection jobs for a settlement ────────
create or replace function app.enqueue_settlement_projections(p_tenant uuid, p_event uuid, p_settlement_id uuid, p_version int)
returns void language plpgsql security definer set search_path = public as $$
declare v_comp uuid; v_creator uuid; u record;
  base jsonb;
begin
  select competition_id, creator_id into v_comp, v_creator from events where id = p_event;
  base := jsonb_build_object('event_id', p_event, 'settlement_id', p_settlement_id, 'grading_version', p_version, 'tenant_id', p_tenant);

  -- Per affected user: statistics/streaks and achievements (small, user-scoped).
  for u in select distinct user_id from settlement_grades where settlement_id = p_settlement_id loop
    perform public.enqueue_job(p_tenant, 'projection.user_stats',
      base || jsonb_build_object('user_id', u.user_id), 'stats:' || p_settlement_id::text || ':' || u.user_id::text);
    perform public.enqueue_job(p_tenant, 'projection.achievements',
      base || jsonb_build_object('user_id', u.user_id), 'ach:' || p_settlement_id::text || ':' || u.user_id::text);
  end loop;

  -- Per settlement: scoped leaderboard, draft standings, feed, notifications.
  perform public.enqueue_job(p_tenant, 'projection.leaderboard',
    base || jsonb_build_object('competition_id', v_comp, 'creator_id', v_creator), 'lb:' || p_settlement_id::text);
  perform public.enqueue_job(p_tenant, 'projection.draft_standings',
    base || jsonb_build_object('competition_id', v_comp), 'draft:' || p_settlement_id::text);
  perform public.enqueue_job(p_tenant, 'projection.feed', base, 'feed:' || p_settlement_id::text);
  perform public.enqueue_job(p_tenant, 'projection.notify_settlement', base, 'notify:' || p_settlement_id::text);
end; $$;

-- ── settle_event / regrade_event: enqueue projections instead of inline recompute
create or replace function public.settle_event(
  p_event_id uuid, p_resolution text, p_winning_competitor_id uuid, p_notes text, p_result_url text,
  p_idempotency_key text, p_winning_option_ids uuid[] default null
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
    raise exception 'ALREADY_SETTLED' using errcode = '23505';
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

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, p_winning_competitor_id, v_tenant, p_winning_option_ids);

  update settlements set status = 'active', activated_at = now() where id = v_settlement_id;

  update events
    set status = case p_resolution when 'settled' then 'settled'::event_status
                                   when 'voided' then 'voided'::event_status
                                   else 'canceled'::event_status end,
        settlement_status = 'active'
    where id = p_event_id;

  -- Projections are now durable jobs enqueued in THIS transaction (outbox).
  perform app.enqueue_settlement_projections(v_tenant, p_event_id, v_settlement_id, v_version);

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

create or replace function public.regrade_event(
  p_event_id uuid, p_resolution text, p_winning_competitor_id uuid, p_reason text, p_idempotency_key text,
  p_winning_option_ids uuid[] default null
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
  if v_old_id is null then raise exception 'NOT_SETTLED' using errcode = '22000'; end if;

  if p_resolution = 'settled' then
    if p_winning_competitor_id is null then raise exception 'WINNER_REQUIRED' using errcode = '22000'; end if;
    if not exists (
      select 1 from market_options mo join markets m on m.id = mo.market_id
      where m.event_id = p_event_id and mo.competitor_id = p_winning_competitor_id
    ) then raise exception 'INVALID_WINNER' using errcode = '22000'; end if;
  end if;

  update settlements set status = 'superseded', reversed_at = now() where id = v_old_id;

  v_version := coalesce((select max(grading_version) from settlements where event_id = p_event_id), 0) + 1;

  insert into event_results (tenant_id, event_id, grading_version, source, resolution, winning_competitor_id, notes, result_url, submitted_by)
  values (v_tenant, p_event_id, v_version, 'super_admin_manual', p_resolution, p_winning_competitor_id, p_reason, null, auth.uid())
  returning id into v_result_id;

  insert into settlements (tenant_id, event_id, grading_version, status, result_id, initiated_by, reason)
  values (v_tenant, p_event_id, v_version, 'pending', v_result_id, auth.uid(), p_reason)
  returning id into v_settlement_id;

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, p_winning_competitor_id, v_tenant, p_winning_option_ids);

  update settlements set status = 'active', activated_at = now() where id = v_settlement_id;

  update events
    set status = case p_resolution when 'settled' then 'settled'::event_status
                                   when 'voided' then 'voided'::event_status
                                   else 'canceled'::event_status end
    where id = p_event_id;

  -- New grading version → a fresh set of projection jobs (dedup keyed by the new
  -- settlement id). Old-version jobs remain visible but no longer active.
  perform app.enqueue_settlement_projections(v_tenant, p_event_id, v_settlement_id, v_version);

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

-- ── Tenant-scoped claiming ────────────────────────────────────────────────────
-- Workers may drain all tenants (p_tenant null) or a single tenant. Per-tenant
-- workers isolate one tenant's backlog from another's (and keep parallel tests
-- from claiming each other's jobs).
drop function if exists public.claim_jobs(int);
create or replace function public.claim_jobs(p_limit int default 10, p_tenant uuid default null)
returns setof system_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update system_jobs j set status = 'running', started_at = now(), attempts = attempts + 1
  where j.id in (
    select c.id from system_jobs c
    where c.status = 'pending' and c.run_at <= now()
      and (p_tenant is null or c.tenant_id = p_tenant)
    order by c.run_at
    for update skip locked
    limit greatest(p_limit, 1)
  )
  returning j.*;
end; $$;
revoke all on function public.claim_jobs(int, uuid) from public;
grant execute on function public.claim_jobs(int, uuid) to service_role;

-- ── Retire the synchronous projection triggers (now durable jobs) ─────────────
drop trigger if exists trg_on_settlement_activated on settlements;  -- draft standings → job
drop trigger if exists trg_on_grade_notify on settlement_grades;    -- notifications → job
drop trigger if exists trg_on_settlement_feed on settlements;       -- feed → job

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.project_user_stats(uuid, uuid, int, uuid) from public;
revoke all on function public.project_achievements(uuid, uuid, int, uuid) from public;
revoke all on function public.project_leaderboard(uuid, uuid, int) from public;
revoke all on function public.project_draft_standings(uuid, uuid, int) from public;
revoke all on function public.project_settlement_feed(uuid, uuid, int) from public;
revoke all on function public.project_settlement_notifications(uuid, uuid, int) from public;
grant execute on function public.project_user_stats(uuid, uuid, int, uuid) to service_role;
grant execute on function public.project_achievements(uuid, uuid, int, uuid) to service_role;
grant execute on function public.project_leaderboard(uuid, uuid, int) to service_role;
grant execute on function public.project_draft_standings(uuid, uuid, int) to service_role;
grant execute on function public.project_settlement_feed(uuid, uuid, int) to service_role;
grant execute on function public.project_settlement_notifications(uuid, uuid, int) to service_role;
