-- ============================================================================
-- 0069_event_lifecycle — Creator Event Lifecycle (EVT).
--
-- Gives authorized creators complete, safe control over the events they own:
--   DRAFT → OPEN → LOCKED → SETTLED, with CANCELED as a terminal escape from any
--   pre-settlement state, and (already supported) regrade-to-SETTLED / to-VOID as
--   the post-settlement correction path.
--
-- This EXTENDS the existing engine; it never forks it. Settlement and grading stay
-- entirely in settle_event / regrade_event (0047). Audit reuses app.write_audit
-- (0002); notifications reuse app.emit_notification (0020) via the durable job
-- queue (0035); auto-lock stays app.lock_due_markets (0007). The only settlement
-- change is one additive guard so a CANCELED event can never be settled.
--
-- Authorization tiers (server + DB enforced, SECURITY DEFINER):
--   • manage (edit / publish / lock / cancel) → app.can_manage_event  = super_admin
--     or the event's creator-owner. Does NOT require settlement_enabled.
--   • settle / correct / void                 → app.can_settle_event  (0011) =
--     super_admin or creator-owner WITH settlement_enabled.
-- ============================================================================

-- ── Authorization + integrity helpers ────────────────────────────────────────

-- Can the caller MANAGE this event's lifecycle (edit/publish/lock/cancel)?
-- Mirrors create_event_with_market's check: super-admin, service role, or the
-- owning creator. Settlement is a separate, stricter grant (app.can_settle_event).
create or replace function app.can_manage_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.is_super_admin()
     or coalesce(auth.role(), '') = 'service_role'
     or exists (
       select 1 from events e join creators c on c.id = e.creator_id
       where e.id = p_event and c.owner_user_id = auth.uid()
     );
$$;

-- Has anyone submitted a prediction on this event? Gates destructive edits.
create or replace function app.event_has_predictions(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from predictions p join markets m on m.id = p.market_id
    where m.event_id = p_event
  );
$$;

-- ── publish_event: DRAFT → OPEN ──────────────────────────────────────────────
-- Opens a draft event and its markets. Idempotent if already open. Publication
-- fan-out (feed + follower notifications) is fired by the existing
-- app.on_event_published() trigger when status enters 'open'.
create or replace function public.publish_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event events%rowtype;
begin
  if not app.can_manage_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_event.status = 'open' then
    return jsonb_build_object('event_id', p_event_id, 'status', 'open', 'changed', false);
  end if;
  if v_event.status <> 'draft' then raise exception 'INVALID_STATE' using errcode = '22000'; end if;

  update events set status = 'open' where id = p_event_id;
  update markets set status = 'open' where event_id = p_event_id and status = 'draft';
  perform app.write_audit('event.publish', 'event', p_event_id, v_event.tenant_id, auth.uid(), 'Event published', '{}'::jsonb);
  return jsonb_build_object('event_id', p_event_id, 'status', 'open', 'changed', true);
end; $$;

-- ── lock_event: OPEN → LOCKED (manual) ───────────────────────────────────────
-- Produces the SAME authoritative locked state as automatic lock
-- (app.lock_due_markets, 0007): the event and its open markets both flip to
-- 'locked', after which submit_prediction rejects new predictions (MARKET_NOT_OPEN
-- plus the server now() >= locks_at gate). Idempotent. There is no unlock (V1):
-- lock_due_markets only ever flips open→locked, so a manually locked event never
-- reopens when its scheduled locks_at is later edited.
create or replace function public.lock_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event events%rowtype;
begin
  if not app.can_manage_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_event.status = 'locked' then
    return jsonb_build_object('event_id', p_event_id, 'status', 'locked', 'changed', false);
  end if;
  if v_event.status <> 'open' then raise exception 'INVALID_STATE' using errcode = '22000'; end if;

  update events set status = 'locked' where id = p_event_id;
  update markets set status = 'locked' where event_id = p_event_id and status = 'open';
  perform app.write_audit('event.lock', 'event', p_event_id, v_event.tenant_id, auth.uid(), 'Event locked manually',
    jsonb_build_object('mode', 'manual'));
  return jsonb_build_object('event_id', p_event_id, 'status', 'locked', 'changed', true);
end; $$;

-- ── cancel_event: DRAFT / OPEN / LOCKED → CANCELED ───────────────────────────
-- Terminal, non-destructive. Predictions are PRESERVED and marked void so they
-- never score; markets close. No grades or projections are written because an
-- unsettled event was never counted in any derived stat — leaderboards, streaks,
-- achievements and draft standings all read active-settlement grades, of which a
-- never-settled event has none, so there is nothing to rebuild. Community Health
-- reads events/predictions directly and excludes canceled events (0070). A finally
-- settled/voided event is NOT cancellable here (ALREADY_SETTLED); that is the
-- distinct regrade-to-void correction workflow. Idempotent.
create or replace function public.cancel_event(p_event_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event events%rowtype; v_tenant uuid; v_voided int;
begin
  if not app.can_manage_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  v_tenant := v_event.tenant_id;

  if v_event.status = 'canceled' then
    return jsonb_build_object('event_id', p_event_id, 'status', 'canceled', 'changed', false);
  end if;
  if v_event.status in ('settled', 'voided')
     or exists (select 1 from settlements where event_id = p_event_id and status = 'active') then
    raise exception 'ALREADY_SETTLED' using errcode = '23505';  -- use regrade-to-void instead
  end if;

  update events set status = 'canceled' where id = p_event_id;
  update markets set status = 'canceled' where event_id = p_event_id and status <> 'settled';
  update predictions p set status = 'void'
    from markets m
    where m.id = p.market_id and m.event_id = p_event_id and p.status in ('active', 'locked');
  get diagnostics v_voided = row_count;

  perform app.write_audit('event.cancel', 'event', p_event_id, v_tenant, auth.uid(),
    coalesce(nullif(p_reason, ''), 'Event canceled'),
    jsonb_build_object('reason', p_reason, 'voided_predictions', v_voided, 'from_status', v_event.status));

  -- Notify affected participants asynchronously (durable queue + emit_notification,
  -- deduped so a re-run never double-sends).
  perform public.enqueue_job(v_tenant, 'projection.event_cancel',
    jsonb_build_object('tenant_id', v_tenant, 'event_id', p_event_id),
    'event-cancel-notify:' || p_event_id::text);

  return jsonb_build_object('event_id', p_event_id, 'status', 'canceled', 'changed', true, 'voided_predictions', v_voided);
end; $$;

-- Fan out "Event canceled" to everyone who predicted (mandatory notice — not
-- gated by preferences). Deduped per (event, user); idempotent. Runs from the
-- 'projection.event_cancel' job handler.
create or replace function public.project_event_cancel_notifications(p_event uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_title text; u record;
begin
  select tenant_id, title into v_tenant, v_title from events where id = p_event and status = 'canceled';
  if v_tenant is null then return false; end if;  -- not canceled (stale job) → no-op
  for u in
    select distinct p.user_id from predictions p join markets m on m.id = p.market_id where m.event_id = p_event
  loop
    perform app.emit_notification(v_tenant, u.user_id, 'event_canceled', 'Event canceled', v_title,
      'event', p_event, 'event-cancel:' || p_event::text || ':' || u.user_id::text,
      jsonb_build_object('event_id', p_event));
  end loop;
  return true;
end; $$;
revoke all on function public.project_event_cancel_notifications(uuid) from public;
grant execute on function public.project_event_cancel_notifications(uuid) to service_role;

-- ── update_event: safe edits always, structural edits only pre-prediction ─────
-- Applies a partial patch. Cosmetic / logistical fields (title, description,
-- times, media urls, metadata) are always allowed while the event is not terminal.
-- Structural fields that could change what a submitted prediction MEANS
-- (market_question, option labels) are blocked once any prediction exists
-- (PREDICTIONS_EXIST). Competitor-set and market-type changes are never done in
-- place — they require cancel + recreate. Timing edits only while schedulable
-- (draft/open), so editing locks_at can never reopen a locked event.
create or replace function public.update_event(p_event_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event events%rowtype; v_has_preds boolean;
begin
  if not app.can_manage_event(p_event_id) then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'INVALID_PATCH' using errcode = '22000'; end if;
  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_event.status in ('settled', 'voided', 'canceled') then
    raise exception 'EVENT_CLOSED_FOR_EDITS' using errcode = '22000';
  end if;

  -- Competitor / market-type changes are structural re-mappings → never in place.
  if p_patch ?| array['competitors', 'market_type'] then
    raise exception 'STRUCTURAL_CHANGE_REQUIRES_RECREATE' using errcode = '22000';
  end if;

  v_has_preds := app.event_has_predictions(p_event_id);
  if v_has_preds and (p_patch ?| array['market_question', 'options']) then
    raise exception 'PREDICTIONS_EXIST' using errcode = '22000';
  end if;
  if (p_patch ? 'starts_at' or p_patch ? 'locks_at') and v_event.status not in ('draft', 'open') then
    raise exception 'TIMING_LOCKED' using errcode = '22000';
  end if;

  update events set
    title           = coalesce(nullif(p_patch->>'title', ''), title),
    description      = case when p_patch ? 'description'     then nullif(p_patch->>'description', '')            else description end,
    starts_at        = case when p_patch ? 'starts_at'       then nullif(p_patch->>'starts_at', '')::timestamptz else starts_at end,
    locks_at         = case when p_patch ? 'locks_at'        then nullif(p_patch->>'locks_at', '')::timestamptz  else locks_at end,
    youtube_url      = case when p_patch ? 'youtube_url'     then nullif(p_patch->>'youtube_url', '')            else youtube_url end,
    external_url     = case when p_patch ? 'external_url'    then nullif(p_patch->>'external_url', '')           else external_url end,
    cover_image_url  = case when p_patch ? 'cover_image_url' then nullif(p_patch->>'cover_image_url', '')        else cover_image_url end,
    metadata         = case when p_patch ? 'metadata'        then coalesce(p_patch->'metadata', metadata)        else metadata end,
    updated_at       = now()
  where id = p_event_id;

  -- Structural edits (only reachable with zero predictions).
  if p_patch ? 'market_question' and nullif(p_patch->>'market_question', '') is not null then
    update markets set question = p_patch->>'market_question' where event_id = p_event_id;
  end if;
  if p_patch ? 'options' then
    update market_options mo set label = x.label
    from jsonb_to_recordset(p_patch->'options') as x(id uuid, label text)
    where mo.id = x.id and coalesce(x.label, '') <> ''
      and exists (select 1 from markets m where m.id = mo.market_id and m.event_id = p_event_id);
  end if;

  perform app.write_audit('event.edit', 'event', p_event_id, v_event.tenant_id, auth.uid(), 'Event edited',
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_patch) k)));
  return jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'has_predictions', v_has_preds);
end; $$;

-- ── Grants: creator-callable lifecycle RPCs (authorization enforced inside) ───
grant execute on function public.publish_event(uuid) to authenticated, service_role;
grant execute on function public.lock_event(uuid) to authenticated, service_role;
grant execute on function public.cancel_event(uuid, text) to authenticated, service_role;
grant execute on function public.update_event(uuid, jsonb) to authenticated, service_role;

-- ── Settlement guard: a CANCELED event can never be settled ──────────────────
-- Additive extension of settle_event (0047): every prior behaviour is preserved;
-- the sole addition is rejecting settlement of an event already canceled/voided.
-- (A voided/settled event also carries an active settlement, so ALREADY_SETTLED
-- catches it — this makes the canceled-without-settlement case explicit and wins
-- the cancel-vs-settle race deterministically: database state decides.)
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

  -- Additive guard (EVT): a canceled event is terminal and cannot be settled.
  if v_event.status = 'canceled' then raise exception 'EVENT_CANCELED' using errcode = '22000'; end if;

  if exists (select 1 from settlements where event_id = p_event_id and status = 'active') then
    raise exception 'ALREADY_SETTLED' using errcode = '23505';
  end if;

  if p_resolution = 'settled' then
    select vo.v_options, vo.v_competitor into v_win_opts, v_winner_comp
      from app.resolve_winning_options(p_event_id, v_tenant, p_winning_competitor_id, p_winning_option_ids) vo;
    if v_winner_comp is null and exists (select 1 from bracket_slots where event_id = p_event_id) then
      raise exception 'BRACKET_REQUIRES_COMPETITOR' using errcode = '22000';
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
