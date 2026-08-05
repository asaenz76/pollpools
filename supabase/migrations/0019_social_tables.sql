-- ============================================================================
-- 0019_social_tables.sql  (Phase 5 — Social experience)
-- Creator following, the activity feed, notifications, likes, and comments.
-- Feed + notifications are idempotent via a per-tenant dedupe_key.
-- ============================================================================

-- Draft notification types (Phase 4.5 deferred these; generation lands here).
-- ADD VALUE only — no usage in this migration/transaction.
alter type notification_type add value if not exists 'draft_opened';
alter type notification_type add value if not exists 'draft_closing_soon';
alter type notification_type add value if not exists 'draft_confirmed';
alter type notification_type add value if not exists 'draft_reservation_expiring';
alter type notification_type add value if not exists 'draft_payment_confirmed';
alter type notification_type add value if not exists 'draft_payment_failed';
alter type notification_type add value if not exists 'draft_competitor_earned_points';
alter type notification_type add value if not exists 'draft_rank_changed';
alter type notification_type add value if not exists 'draft_competition_completed';
alter type notification_type add value if not exists 'prize_awarded';

-- ── creator_follows ─────────────────────────────────────────────────────────
create table creator_follows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid not null references creators (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (creator_id, user_id)
);
create index idx_creator_follows_creator on creator_follows (creator_id);
create index idx_creator_follows_user on creator_follows (tenant_id, user_id);

-- ── feed_activities ─────────────────────────────────────────────────────────
create table feed_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  type feed_activity_type not null,
  actor_user_id uuid references users (id) on delete set null,
  actor_creator_id uuid references creators (id) on delete set null,
  subject_user_id uuid references users (id) on delete set null,
  event_id uuid references events (id) on delete cascade,
  competition_id uuid references competitions (id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);
create index idx_feed_tenant_time on feed_activities (tenant_id, created_at desc);
create index idx_feed_actor_creator on feed_activities (actor_creator_id, created_at desc);

-- ── notifications ───────────────────────────────────────────────────────────
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);
create index idx_notifications_user on notifications (tenant_id, user_id, created_at desc);
create index idx_notifications_unread on notifications (tenant_id, user_id) where read_at is null;

-- ── likes (behind likes_enabled) ────────────────────────────────────────────
create table likes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  subject_type text not null check (subject_type in ('event', 'feed_activity', 'comment')),
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, subject_type, subject_id)
);
create index idx_likes_subject on likes (subject_type, subject_id);

-- ── comments (behind comments_enabled) ──────────────────────────────────────
create table comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  subject_type text not null check (subject_type in ('event', 'feed_activity')),
  subject_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_comments_subject on comments (subject_type, subject_id, created_at);

create trigger trg_comments_updated_at
  before update on comments
  for each row execute function app.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table creator_follows enable row level security;
alter table feed_activities enable row level security;
alter table notifications enable row level security;
alter table likes enable row level security;
alter table comments enable row level security;

-- Follows: public counts; user manages their own.
create policy follows_select on creator_follows for select using (true);
create policy follows_insert on creator_follows for insert with check (user_id = auth.uid());
create policy follows_delete on creator_follows for delete using (user_id = auth.uid());

-- Feed: public read for active tenants; written only by triggers/service.
create policy feed_select on feed_activities for select
  using (
    app.is_super_admin()
    or exists (select 1 from tenants t where t.id = tenant_id and t.status = 'active')
  );

-- Notifications: owner reads + marks read; written only by triggers/service.
create policy notifications_select on notifications for select
  using (user_id = auth.uid() or app.is_super_admin());
create policy notifications_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Likes: public read; user manages own.
create policy likes_select on likes for select using (true);
create policy likes_insert on likes for insert with check (user_id = auth.uid());
create policy likes_delete on likes for delete using (user_id = auth.uid());

-- Comments: visible ones public; owner writes own; owner/admin edit; admin moderates.
create policy comments_select on comments for select
  using (status = 'visible' or user_id = auth.uid() or app.is_super_admin());
create policy comments_insert on comments for insert with check (user_id = auth.uid());
create policy comments_update on comments for update
  using (user_id = auth.uid() or app.is_super_admin())
  with check (user_id = auth.uid() or app.is_super_admin());
create policy comments_delete on comments for delete
  using (app.is_super_admin());
