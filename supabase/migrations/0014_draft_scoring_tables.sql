-- ============================================================================
-- 0014_draft_scoring_tables.sql  (Phase 4.5)
-- Finishing-position results (immutable per grading version) + derived competitor
-- competition stats + the SEPARATE draft leaderboard. Draft standings never mix
-- with prediction standings.
-- ============================================================================

-- ── event_competitor_results — per-competitor finish for a grading version ──
create table event_competitor_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  grading_version integer not null,
  competitor_id uuid not null references competitors (id) on delete cascade,
  finishing_position integer check (finishing_position is null or finishing_position >= 1),
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, grading_version, competitor_id)
);
create index idx_ecr_event on event_competitor_results (event_id, grading_version);
create index idx_ecr_competitor on event_competitor_results (competitor_id);

-- ── competitor_competition_stats — derived (recomputed from active results) ──
create table competitor_competition_stats (
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  competitor_id uuid not null references competitors (id) on delete cascade,
  total_points integer not null default 0,
  wins integer not null default 0,
  podiums integer not null default 0,
  top_finishes integer not null default 0,
  events_completed integer not null default 0,
  best_position integer,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, competition_id, competitor_id)
);
create index idx_ccs_competition on competitor_competition_stats (competition_id, total_points desc);

-- ── draft_leaderboard_snapshots — materialized draft standings ──────────────
create table draft_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  assignment_id uuid not null references competitor_draft_assignments (id) on delete cascade,
  competitor_id uuid not null references competitors (id) on delete cascade,
  rank integer,
  competition_points integer not null default 0,
  wins integer not null default 0,
  podiums integer not null default 0,
  events_completed integer not null default 0,
  confirmed_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (tenant_id, competition_id, user_id)
);
create index idx_draft_lb_lookup on draft_leaderboard_snapshots (competition_id, rank);

-- ── RLS: results + stats + standings are public reads; writes via functions ──
alter table event_competitor_results enable row level security;
alter table competitor_competition_stats enable row level security;
alter table draft_leaderboard_snapshots enable row level security;

create policy ecr_select on event_competitor_results for select
  using (app.is_super_admin() or app.event_is_public(event_id) or app.owns_event(event_id));
create policy ccs_select on competitor_competition_stats for select using (true);
create policy draft_lb_select on draft_leaderboard_snapshots for select using (true);
