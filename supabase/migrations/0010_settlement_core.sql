-- ============================================================================
-- 0010_settlement_core.sql
-- Phase 4: results, versioned/idempotent settlement, grades, derived statistics,
-- leaderboard snapshots, and achievements.
--
-- Design: settlement_grades are IMMUTABLE per grading version. Derived
-- statistics (user_statistics, competition_statistics) are a cache RECOMPUTED
-- from the currently-active grades — so settle, void, and regrade are all just
-- "recompute from the active set", which is trivially reversible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- event_results — the recorded outcome for a grading version of an event.
-- ----------------------------------------------------------------------------
create table event_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  grading_version integer not null,
  source result_source_type not null default 'creator_manual',
  resolution text not null check (resolution in ('settled', 'voided', 'canceled')),
  winning_competitor_id uuid references competitors (id) on delete set null,
  notes text,
  result_url text,
  submitted_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, grading_version)
);
create index idx_event_results_event on event_results (event_id);

-- ----------------------------------------------------------------------------
-- settlements — one row per grading version; at most one active per event.
-- ----------------------------------------------------------------------------
create table settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  grading_version integer not null,
  status settlement_status not null default 'pending',
  result_id uuid references event_results (id) on delete set null,
  initiated_by uuid references users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  reversed_at timestamptz,
  unique (event_id, grading_version)
);
-- Only one active settlement per event.
create unique index uq_settlement_active_per_event
  on settlements (event_id) where status = 'active';
create index idx_settlements_event on settlements (event_id, grading_version);

-- ----------------------------------------------------------------------------
-- settlement_grades — immutable per-prediction grade for a grading version.
-- ----------------------------------------------------------------------------
create table settlement_grades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  settlement_id uuid not null references settlements (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  grading_version integer not null,
  prediction_id uuid not null references predictions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  market_id uuid not null references markets (id) on delete cascade,
  option_id uuid not null references market_options (id) on delete cascade,
  outcome text not null check (outcome in ('correct', 'incorrect', 'void')),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (settlement_id, prediction_id)
);
create index idx_grades_settlement on settlement_grades (settlement_id);
create index idx_grades_user on settlement_grades (tenant_id, user_id);
create index idx_grades_event on settlement_grades (event_id);

-- ----------------------------------------------------------------------------
-- user_statistics — derived per-user-per-tenant cache (recomputed).
-- ----------------------------------------------------------------------------
create table user_statistics (
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  total_predictions integer not null default 0,   -- graded (correct + incorrect)
  correct_predictions integer not null default 0,
  incorrect_predictions integer not null default 0,
  total_points integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  first_graded_at timestamptz,
  last_graded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index idx_user_stats_leaderboard
  on user_statistics (tenant_id, total_points desc, correct_predictions desc);

-- ----------------------------------------------------------------------------
-- competition_statistics — derived per-user-per-competition cache.
-- ----------------------------------------------------------------------------
create table competition_statistics (
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  total_points integer not null default 0,
  correct_predictions integer not null default 0,
  incorrect_predictions integer not null default 0,
  first_graded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, competition_id, user_id)
);
create index idx_competition_stats on competition_statistics (competition_id, total_points desc);

-- ----------------------------------------------------------------------------
-- leaderboard_snapshots — materialized rankings (spec §16).
-- ----------------------------------------------------------------------------
create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  scope leaderboard_scope not null,
  scope_id uuid,                       -- creator_id / competition_id; null for global
  period text not null default 'all_time',
  user_id uuid not null references users (id) on delete cascade,
  rank integer,                        -- null when unranked (below threshold)
  total_points integer not null default 0,
  correct_predictions integer not null default 0,
  accuracy numeric(6, 4) not null default 0,
  ranked boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (tenant_id, scope, scope_id, period, user_id)
);
create index idx_leaderboard_lookup on leaderboard_snapshots (tenant_id, scope, scope_id, period, rank);

-- ----------------------------------------------------------------------------
-- achievements — tenant-scoped, rule-driven definitions.
-- ----------------------------------------------------------------------------
create table achievements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  rule jsonb not null,                 -- {type, threshold?, minSample?}
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);
create index idx_achievements_tenant on achievements (tenant_id) where active;

-- ----------------------------------------------------------------------------
-- user_achievements — immutable grants (revocable via revoked_at, not deletion).
-- ----------------------------------------------------------------------------
create table user_achievements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  achievement_id uuid not null references achievements (id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  context jsonb not null default '{}'::jsonb,
  unique (tenant_id, user_id, achievement_id)
);
create index idx_user_achievements_user on user_achievements (tenant_id, user_id) where revoked_at is null;

-- ----------------------------------------------------------------------------
-- RLS. Public-readable derived/result data; writes only via settlement funcs.
-- ----------------------------------------------------------------------------
alter table event_results          enable row level security;
alter table settlements            enable row level security;
alter table settlement_grades      enable row level security;
alter table user_statistics        enable row level security;
alter table competition_statistics enable row level security;
alter table leaderboard_snapshots  enable row level security;
alter table achievements           enable row level security;
alter table user_achievements      enable row level security;

-- Results are public for non-draft events.
create policy event_results_select on event_results for select
  using (app.is_super_admin() or app.event_is_public(event_id) or app.owns_event(event_id));

-- Settlement metadata is admin/owner only.
create policy settlements_select on settlements for select
  using (app.is_super_admin() or app.owns_event(event_id));

-- A user can read their own grades; owners/admins read all for their events.
create policy settlement_grades_select on settlement_grades for select
  using (user_id = auth.uid() or app.is_super_admin() or app.owns_event(event_id));

-- Stats, leaderboards, achievements are public (profiles + leaderboards).
create policy user_statistics_select on user_statistics for select using (true);
create policy competition_statistics_select on competition_statistics for select using (true);
create policy leaderboard_snapshots_select on leaderboard_snapshots for select using (true);
create policy achievements_select on achievements for select using (true);
create policy user_achievements_select on user_achievements for select using (true);
