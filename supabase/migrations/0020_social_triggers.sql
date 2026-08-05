-- ============================================================================
-- 0020_social_triggers.sql  (Phase 5)
-- Idempotent notification + feed generation via triggers. Everything dedupes on
-- (tenant_id, dedupe_key), so settlement retries / regrades never duplicate.
-- ============================================================================

create or replace function app.emit_notification(
  p_tenant uuid, p_user uuid, p_type notification_type, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe_key text, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into notifications (tenant_id, user_id, type, title, body, entity_type, entity_id, dedupe_key, metadata)
  values (p_tenant, p_user, p_type, p_title, p_body, p_entity_type, p_entity_id, p_dedupe_key, p_metadata)
  on conflict (tenant_id, dedupe_key) do nothing;
$$;

create or replace function app.emit_feed(
  p_tenant uuid, p_type feed_activity_type, p_dedupe_key text,
  p_actor_user uuid, p_actor_creator uuid, p_subject_user uuid,
  p_event uuid, p_competition uuid, p_metadata jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into feed_activities (tenant_id, type, actor_user_id, actor_creator_id, subject_user_id, event_id, competition_id, dedupe_key, metadata)
  values (p_tenant, p_type, p_actor_user, p_actor_creator, p_subject_user, p_event, p_competition, p_dedupe_key, p_metadata)
  on conflict (tenant_id, dedupe_key) do nothing;
$$;

-- Prediction graded → notify the predictor (correct/incorrect).
create or replace function app.on_grade_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if new.outcome not in ('correct', 'incorrect') then return new; end if;
  select title into v_title from events where id = new.event_id;
  perform app.emit_notification(new.tenant_id, new.user_id,
    (case when new.outcome = 'correct' then 'prediction_correct' else 'prediction_incorrect' end)::notification_type,
    (case when new.outcome = 'correct' then 'Correct prediction' else 'Prediction missed' end),
    v_title, 'event', new.event_id,
    'pred:' || new.prediction_id::text || ':' || new.grading_version::text,
    jsonb_build_object('outcome', new.outcome));
  return new;
end; $$;
create trigger trg_on_grade_notify after insert on settlement_grades
  for each row execute function app.on_grade_notify();

-- Achievement earned → notify + feed.
create or replace function app.on_achievement_social() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from achievements where id = new.achievement_id;
  perform app.emit_notification(new.tenant_id, new.user_id, 'achievement_earned', 'Achievement unlocked',
    v_name, 'achievement', new.achievement_id, 'ach:' || new.id::text, jsonb_build_object('name', v_name));
  perform app.emit_feed(new.tenant_id, 'user_earned_achievement', 'ach_feed:' || new.id::text,
    new.user_id, null, new.user_id, null, null, jsonb_build_object('achievement_name', v_name));
  return new;
end; $$;
create trigger trg_on_achievement_social after insert on user_achievements
  for each row execute function app.on_achievement_social();

-- New follower → notify the creator's owner.
create or replace function app.on_follow_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_user_id into v_owner from creators where id = new.creator_id;
  if v_owner is not null then
    perform app.emit_notification(new.tenant_id, v_owner, 'creator_followed', 'New follower',
      null, 'creator', new.creator_id, 'follow:' || new.id::text);
  end if;
  return new;
end; $$;
create trigger trg_on_follow_notify after insert on creator_follows
  for each row execute function app.on_follow_notify();

-- Event becomes public → feed + notify the creator's followers.
create or replace function app.on_event_published() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('published', 'open')
     and (tg_op = 'INSERT' or old.status not in ('published', 'open')) then
    perform app.emit_feed(new.tenant_id, 'creator_published_event', 'event_pub:' || new.id::text,
      null, new.creator_id, null, new.id, new.competition_id, jsonb_build_object('title', new.title));
    insert into notifications (tenant_id, user_id, type, title, body, entity_type, entity_id, dedupe_key)
      select new.tenant_id, f.user_id, 'new_creator_event', 'New event', new.title, 'event', new.id,
             'new_event:' || new.id::text || ':' || f.user_id::text
      from creator_follows f where f.creator_id = new.creator_id
      on conflict (tenant_id, dedupe_key) do nothing;
  end if;
  return new;
end; $$;
create trigger trg_on_event_published after insert or update on events
  for each row execute function app.on_event_published();

-- Settlement activated → feed 'event_settled'.
create or replace function app.on_settlement_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_title text;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select creator_id, title into v_creator, v_title from events where id = new.event_id;
    perform app.emit_feed(new.tenant_id, 'event_settled',
      'settled:' || new.event_id::text || ':' || new.grading_version::text,
      null, v_creator, null, new.event_id, null, jsonb_build_object('title', v_title));
  end if;
  return new;
end; $$;
create trigger trg_on_settlement_feed after update on settlements
  for each row execute function app.on_settlement_feed();

-- Draft assignment confirmed/active → notify the drafter.
create or replace function app.on_draft_confirmed_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('confirmed', 'active')
     and (tg_op = 'INSERT' or old.status not in ('confirmed', 'active')) then
    perform app.emit_notification(new.tenant_id, new.user_id, 'draft_confirmed', 'Draft confirmed',
      null, 'competition', new.competition_id, 'draft_conf:' || new.id::text);
  end if;
  return new;
end; $$;
create trigger trg_on_draft_confirmed_notify after insert or update on competitor_draft_assignments
  for each row execute function app.on_draft_confirmed_notify();

-- Prediction submitted → feed activity.
create or replace function app.on_prediction_feed() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_event uuid;
begin
  select event_id into v_event from markets where id = new.market_id;
  perform app.emit_feed(new.tenant_id, 'user_submitted_prediction', 'pred_sub:' || new.id::text,
    new.user_id, null, new.user_id, v_event, null, '{}'::jsonb);
  return new;
end; $$;
create trigger trg_on_prediction_feed after insert on predictions
  for each row execute function app.on_prediction_feed();
