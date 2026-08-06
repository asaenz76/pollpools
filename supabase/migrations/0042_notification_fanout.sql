-- ============================================================================
-- 0042 — Phase 7.5 §5F: asynchronous, batched notification & feed fan-out (F-19).
--
-- Event publication no longer loops through followers synchronously. Publishing
-- commits, and the trigger enqueues durable jobs in the SAME transaction (outbox):
--   * projection.event_publish_feed   — one canonical feed activity (idempotent).
--   * projection.event_publish_fanout — batched per-follower notification fan-out,
--     tracked durably in `notification_fanouts` (cursor-based, resumable).
--
-- FEED MODEL: one canonical `feed_activities` row per activity, filtered at read
-- time (the feed is a tenant-wide stream). There are NO per-recipient feed rows —
-- only notifications need recipient-specific rows.
--
-- ELIGIBILITY: a follower receives the publication notification iff they followed
-- BEFORE the fan-out was created (created_at cutoff) and are still following when
-- their batch is processed. Followers who unfollow before their batch, or follow
-- after publication, are excluded.
-- ============================================================================

-- Efficient tenant-scoped FIFO claiming (the worker claims pending jobs for one
-- tenant, oldest first). §5F raised job volume (event-publish enqueues too), so an
-- index matching the claim predicate keeps claiming O(due-jobs), not a scan.
create index if not exists idx_system_jobs_claim on system_jobs (tenant_id, run_at, seq) where status = 'pending';

create type fanout_status as enum ('pending', 'running', 'completed', 'failed', 'canceled', 'superseded');

create table notification_fanouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  source_type text not null,                 -- 'event'
  source_id uuid not null,
  notification_type notification_type not null,
  source_version text not null,              -- publication version (event updated_at snapshot)
  status fanout_status not null default 'pending',
  last_recipient_id uuid,                     -- cursor (follower user id)
  recipients_processed integer not null default 0,
  batches_processed integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error text,
  dedup_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_notification_fanouts_status on notification_fanouts (status, created_at);
alter table notification_fanouts enable row level security;  -- service-role only (no policies)
create trigger trg_notification_fanouts_updated_at before update on notification_fanouts
  for each row execute function app.set_updated_at();

-- ── User notification preferences (tenant-scoped; opt-out, default on) ────────
create table user_notification_preferences (
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  event_published boolean not null default true,
  event_locking_soon boolean not null default true,
  event_result boolean not null default true,
  achievement_earned boolean not null default true,
  leaderboard_milestone boolean not null default true,
  creator_billing boolean not null default true,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,   -- email transport not yet built (§8+)
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table user_notification_preferences enable row level security;
create policy unp_select on user_notification_preferences for select using (user_id = auth.uid() or app.is_super_admin());
create policy unp_upsert on user_notification_preferences for insert with check (user_id = auth.uid());
create policy unp_update on user_notification_preferences for update using (user_id = auth.uid());
create trigger trg_unp_updated_at before update on user_notification_preferences
  for each row execute function app.set_updated_at();

-- Is an OPTIONAL notification of a given category allowed for a user? Absent
-- preferences default to allowed. Critical billing/security notifications do not
-- call this (they are mandatory).
create or replace function app.notification_allowed(p_tenant uuid, p_user uuid, p_category text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select in_app_enabled and case p_category
      when 'event_published' then event_published
      when 'event_locking_soon' then event_locking_soon
      when 'event_result' then event_result
      when 'achievement_earned' then achievement_earned
      when 'leaderboard_milestone' then leaderboard_milestone
      when 'creator_billing' then creator_billing
      else true end
    from user_notification_preferences where tenant_id = p_tenant and user_id = p_user
  ), true);
$$;

-- ── Event publication: enqueue durable jobs instead of a synchronous loop ─────
create or replace function app.on_event_published() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pubver text; v_dedup text;
begin
  if new.status in ('published', 'open')
     and (tg_op = 'INSERT' or old.status not in ('published', 'open')) then
    v_pubver := to_char(new.updated_at, 'YYYYMMDDHH24MISSUS');  -- publication version snapshot
    v_dedup := 'fanout:event:' || new.id::text || ':' || v_pubver;

    -- Feed: one canonical activity (durable job).
    perform public.enqueue_job(new.tenant_id, 'projection.event_publish_feed',
      jsonb_build_object('tenant_id', new.tenant_id, 'event_id', new.id),
      'feedpub:' || new.id::text || ':' || v_pubver);

    -- Notifications: durable batched fan-out state + job (transactional outbox).
    insert into notification_fanouts (tenant_id, source_type, source_id, notification_type, source_version, status, dedup_key)
    values (new.tenant_id, 'event', new.id, 'new_creator_event', v_pubver, 'pending', v_dedup)
    on conflict (dedup_key) do nothing;
    perform public.enqueue_job(new.tenant_id, 'projection.event_publish_fanout',
      jsonb_build_object('tenant_id', new.tenant_id, 'fanout_dedup', v_dedup),
      'fanoutjob:' || new.id::text || ':' || v_pubver);
  end if;
  return new;
end; $$;
-- (trigger trg_on_event_published already bound in 0020)

-- Process ONE bounded batch of a fan-out. Cursor-based, resumable, idempotent.
-- Returns 'more' (batch full → more remain) or 'done'.
create or replace function public.process_event_publish_fanout(p_fanout_id uuid, p_batch_size int default 100)
returns text language plpgsql security definer set search_path = public as $$
declare v_fo notification_fanouts%rowtype; v_creator uuid; v_title text; v_last uuid; v_count int := 0; r record;
begin
  select * into v_fo from notification_fanouts where id = p_fanout_id for update;  -- serialize this fan-out
  if not found then return 'done'; end if;
  if v_fo.status in ('completed', 'canceled', 'superseded') then return 'done'; end if;
  update notification_fanouts set status = 'running', started_at = coalesce(started_at, now()) where id = p_fanout_id;

  select creator_id, title into v_creator, v_title from events where id = v_fo.source_id;

  for r in
    select f.user_id from creator_follows f
    where f.creator_id = v_creator
      and f.created_at <= v_fo.created_at                                    -- followed before publication
      and (v_fo.last_recipient_id is null or f.user_id > v_fo.last_recipient_id)
    order by f.user_id
    limit greatest(p_batch_size, 1)
  loop
    if app.notification_allowed(v_fo.tenant_id, r.user_id, 'event_published') then
      insert into notifications (tenant_id, user_id, type, title, body, entity_type, entity_id, dedupe_key, metadata)
      values (v_fo.tenant_id, r.user_id, 'new_creator_event', 'New event', v_title, 'event', v_fo.source_id,
        'event-published:' || v_fo.source_id::text || ':' || r.user_id::text || ':' || v_fo.source_version,
        jsonb_build_object('publication_version', v_fo.source_version))
      on conflict (tenant_id, dedupe_key) do nothing;
    end if;
    v_last := r.user_id;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    update notification_fanouts set status = 'completed', completed_at = now() where id = p_fanout_id;
    return 'done';
  end if;
  update notification_fanouts set last_recipient_id = v_last, recipients_processed = recipients_processed + v_count,
    batches_processed = batches_processed + 1 where id = p_fanout_id;
  if v_count < p_batch_size then
    update notification_fanouts set status = 'completed', completed_at = now() where id = p_fanout_id;
    return 'done';
  end if;
  return 'more';
end; $$;

-- Canonical feed activity for a published event (idempotent).
create or replace function public.project_event_publish_feed(p_tenant uuid, p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_comp uuid; v_title text;
begin
  select creator_id, competition_id, title into v_creator, v_comp, v_title from events where id = p_event;
  perform app.emit_feed(p_tenant, 'creator_published_event', 'event_pub:' || p_event::text,
    null, v_creator, null, p_event, v_comp, jsonb_build_object('title', v_title));
end; $$;

-- ── Settlement notifications: corrected-result semantics on regrade ───────────
create or replace function public.project_settlement_notifications(p_tenant uuid, p_event uuid, p_version int)
returns boolean language plpgsql security definer set search_path = public as $$
declare g record; v_title text; v_type notification_type; v_ntitle text; v_corrected boolean;
begin
  if not app.projection_version_active(p_event, p_version) then return false; end if;
  select title into v_title from events where id = p_event;
  v_corrected := p_version > 1;  -- a later grading version is a correction
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
        jsonb_build_object('outcome', g.outcome, 'corrected', v_corrected));
    end if;
  end loop;
  return true;
end; $$;

-- ── Leaderboard milestone notifications (configured thresholds only) ──────────
-- Emitted after a successful scoped leaderboard refresh; idempotent per milestone.
create or replace function app.emit_leaderboard_milestones(p_tenant uuid, p_scope leaderboard_scope, p_scope_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; m int;
begin
  for r in
    select user_id, rank from leaderboard_snapshots
    where tenant_id = p_tenant and scope = p_scope and coalesce(scope_id::text, 'global') = coalesce(p_scope_id::text, 'global')
      and period = 'all_time' and ranked and rank is not null and rank <= 100
  loop
    foreach m in array array[1, 10, 100] loop
      if r.rank <= m and app.notification_allowed(p_tenant, r.user_id, 'leaderboard_milestone') then
        perform app.emit_notification(p_tenant, r.user_id, 'leaderboard_milestone',
          case m when 1 then 'You reached #1' when 10 then 'You reached the top 10' else 'You reached the top 100' end,
          null, 'leaderboard', p_scope_id,
          'leaderboard-milestone:' || p_scope::text || ':' || coalesce(p_scope_id::text, 'global') || ':' || r.user_id::text || ':' || m::text,
          jsonb_build_object('scope', p_scope, 'milestone', m, 'rank', r.rank));
      end if;
    end loop;
  end loop;
end; $$;

-- Hook milestones into the leaderboard projection (runs only when it applies).
create or replace function public.project_leaderboard_scope(
  p_tenant uuid, p_event uuid, p_version int, p_settlement_id uuid, p_scope text, p_scope_id uuid
) returns text language plpgsql security definer set search_path = public as $$
declare v_ok boolean; v_pre text;
begin
  if not exists (
    select 1 from settlements where id = p_settlement_id and event_id = p_event and status = 'active' and grading_version = p_version
  ) then return 'stale'; end if;
  v_ok := case p_scope
    when 'global' then true
    when 'creator' then exists (select 1 from events where id = p_event and creator_id = p_scope_id)
    when 'competition' then exists (select 1 from events where id = p_event and competition_id = p_scope_id)
    when 'season' then exists (select 1 from events where id = p_event and competition_id = p_scope_id)
    else false end;
  if not v_ok then raise exception 'EVENT_NOT_IN_SCOPE' using errcode = '22000'; end if;

  if p_scope in ('global', 'competition', 'season') then
    v_pre := app.user_stats_prereqs(p_settlement_id);
    if v_pre = 'blocked' then return 'blocked'; end if;
    if v_pre = 'pending' then return 'defer'; end if;
  end if;

  case p_scope
    when 'global' then perform app.refresh_global_leaderboard(p_tenant);
    when 'creator' then perform app.refresh_creator_leaderboard(p_tenant, p_scope_id);
    else perform app.refresh_competition_leaderboard(p_tenant, p_scope_id);
  end case;
  perform app.emit_leaderboard_milestones(p_tenant, p_scope::leaderboard_scope, p_scope_id);
  return 'applied';
end; $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
revoke all on function public.process_event_publish_fanout(uuid, int) from public;
revoke all on function public.project_event_publish_feed(uuid, uuid) from public;
grant execute on function public.process_event_publish_fanout(uuid, int) to service_role;
grant execute on function public.project_event_publish_feed(uuid, uuid) to service_role;
revoke all on function public.project_settlement_notifications(uuid, uuid, int) from public;
grant execute on function public.project_settlement_notifications(uuid, uuid, int) to service_role;
revoke all on function public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid) from public;
grant execute on function public.project_leaderboard_scope(uuid, uuid, int, uuid, text, uuid) to service_role;
