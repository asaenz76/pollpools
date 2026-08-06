-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7.76 — Option-based settlement completion (resolves LEAK-1 / F-03 at the
-- settlement contract).
--
-- The grader (app.apply_grading) already grades by an arbitrary winning-option
-- set. The remaining leak was the settlement CONTRACT: settle_event/regrade_event
-- mandated a winning COMPETITOR (WINNER_REQUIRED) and validated it mapped to an
-- option — so non-competitor outcomes (Draw / Yes / No / …) could not settle.
--
-- After this migration the authoritative result is one or more winning market
-- OPTION ids; the winning competitor is OPTIONAL metadata, derived from the
-- winning option when it references a competitor. No pseudo-competitors are ever
-- created. Bracket advancement still requires a competitor (rejected loudly
-- otherwise). Draft/reconciliation already operate from grades and are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Durable, versioned authoritative winning options ─────────────────────────
create table event_result_options (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  event_id      uuid not null references events (id) on delete cascade,
  grading_version integer not null,
  market_id     uuid not null references markets (id) on delete cascade,
  option_id     uuid not null references market_options (id) on delete cascade,
  competitor_id uuid references competitors (id) on delete set null,   -- optional
  created_at    timestamptz not null default now(),
  unique (event_id, grading_version, option_id)
);
create index idx_event_result_options_lookup on event_result_options (event_id, grading_version);

alter table event_result_options enable row level security;
-- Same visibility as event_results: public for non-draft events, plus owner/admin.
create policy event_result_options_select on event_result_options for select
  using (app.is_super_admin() or app.event_is_public(event_id) or app.owns_event(event_id));

-- ── Shared resolver: validate + resolve the authoritative winning options ─────
-- Returns the validated winning option ids and the DERIVED winning competitor
-- (explicit, else the winning option's competitor, else null for a non-competitor
-- outcome). Enforces all tenant/market/event membership + cardinality rules.
create or replace function app.resolve_winning_options(
  p_event uuid, p_tenant uuid, p_competitor uuid, p_option_ids uuid[],
  out v_options uuid[], out v_competitor uuid
) language plpgsql stable as $$
begin
  if p_option_ids is not null and array_length(p_option_ids, 1) >= 1 then
    -- Option ids are authoritative; every one must belong to this event + tenant.
    select array_agg(mo.id) into v_options
    from market_options mo join markets m on m.id = mo.market_id
    where m.event_id = p_event and mo.tenant_id = p_tenant and mo.id = any(p_option_ids);
    if coalesce(array_length(v_options, 1), 0) <> array_length(p_option_ids, 1) then
      raise exception 'INVALID_WINNING_OPTION' using errcode = '22000';  -- foreign market/event/tenant
    end if;
    if p_competitor is not null and not exists (
      select 1 from market_options mo where mo.id = any(v_options) and mo.competitor_id = p_competitor
    ) then raise exception 'MISMATCHED_COMPETITOR' using errcode = '22000'; end if;
  elsif p_competitor is not null then
    -- Back-compat: resolve the competitor's option(s); must map unambiguously.
    select array_agg(mo.id) into v_options
    from market_options mo join markets m on m.id = mo.market_id
    where m.event_id = p_event and mo.tenant_id = p_tenant and mo.competitor_id = p_competitor;
    if v_options is null then raise exception 'INVALID_WINNER' using errcode = '22000'; end if;
  else
    raise exception 'OPTIONS_REQUIRED' using errcode = '22000';  -- neither options nor competitor
  end if;

  -- SINGLE_CHOICE_WINNER markets accept exactly one winning option.
  if exists (
    select 1 from market_options mo join markets m on m.id = mo.market_id
    where mo.id = any(v_options) and m.type = 'SINGLE_CHOICE_WINNER'
    group by mo.market_id having count(*) > 1
  ) then raise exception 'TOO_MANY_WINNERS' using errcode = '22000'; end if;

  -- Winning competitor is optional metadata: explicit, else the winning option's
  -- competitor (a competitor outcome), else null (a non-competitor outcome).
  v_competitor := coalesce(
    p_competitor,
    (select mo.competitor_id from market_options mo
      where mo.id = any(v_options) and mo.competitor_id is not null
      order by mo.id limit 1)
  );
end; $$;

-- ── settle_event: option-based, optional competitor ──────────────────────────
create or replace function public.settle_event(
  p_event_id uuid, p_resolution text, p_winning_competitor_id uuid, p_notes text, p_result_url text,
  p_idempotency_key text, p_winning_option_ids uuid[] default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_tenant uuid; v_version int; v_result_id uuid; v_settlement_id uuid;
  v_graded int; v_prior jsonb; v_result jsonb; v_win_opts uuid[]; v_winner_comp uuid;
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
    select vo.v_options, vo.v_competitor into v_win_opts, v_winner_comp
      from app.resolve_winning_options(p_event_id, v_tenant, p_winning_competitor_id, p_winning_option_ids) vo;
    if v_winner_comp is null and exists (select 1 from bracket_slots where event_id = p_event_id) then
      raise exception 'BRACKET_REQUIRES_COMPETITOR' using errcode = '22000';  -- brackets need a competitor
    end if;
  end if;

  v_version := coalesce((select max(grading_version) from settlements where event_id = p_event_id), 0) + 1;

  insert into event_results (tenant_id, event_id, grading_version, source, resolution, winning_competitor_id, notes, result_url, submitted_by)
  values (v_tenant, p_event_id, v_version, v_event.result_source, p_resolution, v_winner_comp, p_notes, p_result_url, auth.uid())
  returning id into v_result_id;

  insert into settlements (tenant_id, event_id, grading_version, status, result_id, initiated_by)
  values (v_tenant, p_event_id, v_version, 'pending', v_result_id, auth.uid())
  returning id into v_settlement_id;

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, v_winner_comp, v_tenant, v_win_opts);

  -- Durable authoritative winning options for this version.
  if v_win_opts is not null then
    insert into event_result_options (tenant_id, event_id, grading_version, market_id, option_id, competitor_id)
    select v_tenant, p_event_id, v_version, mo.market_id, mo.id, mo.competitor_id
    from market_options mo where mo.id = any(v_win_opts);
  end if;

  update settlements set status = 'active', activated_at = now() where id = v_settlement_id;

  update events
    set status = case p_resolution when 'settled' then 'settled'::event_status
                                   when 'voided' then 'voided'::event_status
                                   else 'canceled'::event_status end,
        settlement_status = 'active'
    where id = p_event_id;

  perform app.enqueue_settlement_projections(v_tenant, p_event_id, v_settlement_id, v_version);

  if p_resolution = 'settled' and v_winner_comp is not null then
    perform public.advance_bracket(p_event_id, v_winner_comp);
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

-- ── regrade_event: same option-based contract ────────────────────────────────
create or replace function public.regrade_event(
  p_event_id uuid, p_resolution text, p_winning_competitor_id uuid, p_reason text, p_idempotency_key text,
  p_winning_option_ids uuid[] default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_tenant uuid; v_version int; v_result_id uuid; v_settlement_id uuid; v_old_id uuid;
  v_graded int; v_prior jsonb; v_result jsonb; v_win_opts uuid[]; v_winner_comp uuid;
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
    select vo.v_options, vo.v_competitor into v_win_opts, v_winner_comp
      from app.resolve_winning_options(p_event_id, v_tenant, p_winning_competitor_id, p_winning_option_ids) vo;
    if v_winner_comp is null and exists (select 1 from bracket_slots where event_id = p_event_id) then
      raise exception 'BRACKET_REQUIRES_COMPETITOR' using errcode = '22000';
    end if;
  end if;

  update settlements set status = 'superseded', reversed_at = now() where id = v_old_id;

  v_version := coalesce((select max(grading_version) from settlements where event_id = p_event_id), 0) + 1;

  insert into event_results (tenant_id, event_id, grading_version, source, resolution, winning_competitor_id, notes, result_url, submitted_by)
  values (v_tenant, p_event_id, v_version, 'super_admin_manual', p_resolution, v_winner_comp, p_reason, null, auth.uid())
  returning id into v_result_id;

  insert into settlements (tenant_id, event_id, grading_version, status, result_id, initiated_by, reason)
  values (v_tenant, p_event_id, v_version, 'pending', v_result_id, auth.uid(), p_reason)
  returning id into v_settlement_id;

  perform app.apply_grading(v_settlement_id, p_event_id, v_version, p_resolution, v_winner_comp, v_tenant, v_win_opts);

  if v_win_opts is not null then
    insert into event_result_options (tenant_id, event_id, grading_version, market_id, option_id, competitor_id)
    select v_tenant, p_event_id, v_version, mo.market_id, mo.id, mo.competitor_id
    from market_options mo where mo.id = any(v_win_opts);
  end if;

  update settlements set status = 'active', activated_at = now() where id = v_settlement_id;

  update events
    set status = case p_resolution when 'settled' then 'settled'::event_status
                                   when 'voided' then 'voided'::event_status
                                   else 'canceled'::event_status end
    where id = p_event_id;

  perform app.enqueue_settlement_projections(v_tenant, p_event_id, v_settlement_id, v_version);

  if p_resolution = 'settled' and v_winner_comp is not null then
    perform public.advance_bracket(p_event_id, v_winner_comp);
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

-- ── Notifications + feed carry the winning-option LABEL (never a null competitor)
create or replace function public.project_settlement_notifications(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
declare g record; v_title text; v_type notification_type; v_ntitle text; v_corrected boolean; v_result_label text;
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  select title into v_title from events where id = p_event;
  select string_agg(mo.label, ', ' order by mo.display_order) into v_result_label
    from event_result_options ero join market_options mo on mo.id = ero.option_id
    where ero.event_id = p_event and ero.grading_version = p_version;
  v_corrected := p_version > 1;
  for g in
    select prediction_id, user_id, outcome from settlement_grades
    where event_id = p_event and grading_version = p_version and outcome in ('correct', 'incorrect')
  loop
    if v_corrected then
      v_type := 'prediction_updated';
      v_ntitle := case when g.outcome = 'correct' then 'Result corrected — now correct' else 'Result corrected — now missed' end;
    else
      v_type := (case when g.outcome = 'correct' then 'prediction_correct' else 'prediction_incorrect' end)::notification_type;
      v_ntitle := case when g.outcome = 'correct' then 'Correct prediction' else 'Prediction missed' end;
    end if;
    if app.notification_allowed(p_tenant, g.user_id, 'event_result') then
      perform app.emit_notification(p_tenant, g.user_id, v_type, v_ntitle, v_title, 'event', p_event,
        'pred:' || g.prediction_id::text || ':' || p_version::text,
        jsonb_build_object('outcome', g.outcome, 'corrected', v_corrected, 'result_label', v_result_label));
    end if;
  end loop;
  return true;
end; $$;
revoke all on function public.project_settlement_notifications(uuid, uuid, int) from public;
grant execute on function public.project_settlement_notifications(uuid, uuid, int) to service_role;

create or replace function public.project_settlement_feed(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_title text; v_result_label text;
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  select creator_id, title into v_creator, v_title from events where id = p_event;
  select string_agg(mo.label, ', ' order by mo.display_order) into v_result_label
    from event_result_options ero join market_options mo on mo.id = ero.option_id
    where ero.event_id = p_event and ero.grading_version = p_version;
  perform app.emit_feed(p_tenant, 'event_settled', 'settled:' || p_event::text || ':' || p_version::text,
    null, v_creator, null, p_event, null, jsonb_build_object('title', v_title, 'result_label', v_result_label));
  return true;
end; $$;
revoke all on function public.project_settlement_feed(uuid, uuid, int) from public;
grant execute on function public.project_settlement_feed(uuid, uuid, int) to service_role;

-- ── Backfill historical winning options (additive; nothing invented) ─────────
-- Every pre-existing settled result carries a winning competitor (the old
-- contract required one). Derive its option per market where the mapping is
-- unambiguous. Results with no matching option (a voided market) get no row — no
-- result is invented, no history is modified.
insert into event_result_options (tenant_id, event_id, grading_version, market_id, option_id, competitor_id)
select er.tenant_id, er.event_id, er.grading_version, mo.market_id, mo.id, mo.competitor_id
from event_results er
join markets m on m.event_id = er.event_id
join market_options mo on mo.market_id = m.id and mo.competitor_id = er.winning_competitor_id
where er.resolution = 'settled' and er.winning_competitor_id is not null
  and not exists (select 1 from event_result_options x where x.event_id = er.event_id and x.grading_version = er.grading_version);
