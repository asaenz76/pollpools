-- ============================================================================
-- 0033 — Phase 7.5 §3: strategy-based market grading (finding F-03).
--
-- Grading no longer hard-assumes a single competitor-winner. The winning
-- option(s) for each market are resolved by a MarketGrader (TS, per market type)
-- and passed to settlement; the reversible SQL grading marks predictions against
-- that option SET. When option ids are not supplied (e.g. internal bracket
-- auto-advance), it falls back to the single-winner competitor mapping, so all
-- existing callers behave identically.
--
-- Scoring is still literal here; §4 makes points configuration-driven.
-- ============================================================================

-- apply_grading now grades against a winning-option SET (generalizes to any
-- number of winning options) resolved by the caller, else the competitor mapping.
create or replace function app.apply_grading(
  p_settlement_id uuid, p_event_id uuid, p_version int, p_resolution text,
  p_winner uuid, p_tenant uuid, p_winning_option_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_market record; v_pred record; v_win_options uuid[]; v_outcome text; v_points int;
begin
  for v_market in select * from markets where event_id = p_event_id loop
    if p_resolution = 'settled' then
      if p_winning_option_ids is not null then
        -- Winning options resolved by the MarketGrader (TS), scoped to this market.
        select coalesce(array_agg(id), '{}') into v_win_options
          from market_options where market_id = v_market.id and id = any(p_winning_option_ids);
      else
        -- Fallback: single-winner mapping from the winning competitor.
        select coalesce(array_agg(id), '{}') into v_win_options
          from market_options where market_id = v_market.id and competitor_id = p_winner;
      end if;
      update market_options
        set status = (case when id = any(v_win_options) then 'winner' else 'loser' end)::option_status
        where market_id = v_market.id;
      update markets set status = 'settled' where id = v_market.id;
    else
      v_win_options := '{}';
      update market_options set status = 'voided' where market_id = v_market.id;
      update markets
        set status = (case when p_resolution = 'canceled' then 'canceled' else 'voided' end)::market_status
        where id = v_market.id;
    end if;

    for v_pred in select * from predictions where market_id = v_market.id loop
      if p_resolution <> 'settled' or array_length(v_win_options, 1) is null then
        v_outcome := 'void'; v_points := 0;
      elsif v_pred.option_id = any(v_win_options) then
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

-- settle_event / regrade_event gain an optional p_winning_option_ids passed
-- through to grading. Signatures change, so drop the old ones first.
drop function if exists public.settle_event(uuid, text, uuid, text, text, text);
drop function if exists public.regrade_event(uuid, text, uuid, text, text);

create or replace function public.settle_event(
  p_event_id uuid,
  p_resolution text,
  p_winning_competitor_id uuid,
  p_notes text,
  p_result_url text,
  p_idempotency_key text,
  p_winning_option_ids uuid[] default null
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

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, p_winning_competitor_id, v_tenant, p_winning_option_ids);

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

create or replace function public.regrade_event(
  p_event_id uuid,
  p_resolution text,
  p_winning_competitor_id uuid,
  p_reason text,
  p_idempotency_key text,
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

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, p_winning_competitor_id, v_tenant, p_winning_option_ids);

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

-- Grants for the new signatures.
revoke all on function public.settle_event(uuid, text, uuid, text, text, text, uuid[]) from public;
grant execute on function public.settle_event(uuid, text, uuid, text, text, text, uuid[]) to authenticated, service_role;
revoke all on function public.regrade_event(uuid, text, uuid, text, text, uuid[]) from public;
grant execute on function public.regrade_event(uuid, text, uuid, text, text, uuid[]) to authenticated, service_role;
