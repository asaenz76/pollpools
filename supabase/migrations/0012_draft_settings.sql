-- ============================================================================
-- 0012_draft_settings.sql  (Phase 4.5 — Competitor Draft Engine)
-- Additive only. Draft is an OPTIONAL participation model that runs independently
-- from Open Predictions. Enabling it never affects prediction scoring, sentiment,
-- eligibility, or settlement.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────
create type draft_mode as enum ('open', 'exclusive');
create type draft_access_type as enum ('free', 'paid', 'invite_only', 'admin_assigned');
create type draft_status as enum ('draft', 'scheduled', 'open', 'closed', 'active', 'completed', 'canceled');
create type draft_visibility as enum ('public', 'followers_only', 'invite_only');
create type draft_assignment_status as enum ('reserved', 'pending_payment', 'confirmed', 'active', 'completed', 'canceled', 'expired');
create type draft_assignment_source as enum ('user_selected', 'creator_assigned', 'super_admin_assigned', 'random_assignment');
create type draft_payment_status as enum ('not_required', 'pending', 'paid', 'failed', 'refunded', 'canceled');
create type draft_scoring_type as enum ('competition_points');
create type prize_category as enum ('recognition', 'digital', 'physical', 'sponsor', 'premium_access');
create type fulfillment_owner_type as enum ('platform', 'creator', 'sponsor');
create type fulfillment_status as enum ('not_started', 'pending', 'in_progress', 'fulfilled', 'canceled');
create type prize_award_status as enum ('awarded', 'reversed', 'superseded', 'fulfilled', 'canceled');

-- ── Ownership helper ────────────────────────────────────────────────────────
create or replace function app.owns_competition(p_competition uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from competitions c join creators cr on cr.id = c.creator_id
    where c.id = p_competition and cr.owner_user_id = auth.uid()
  );
$$;
grant execute on function app.owns_competition(uuid) to anon, authenticated, service_role;

-- ── competition_draft_settings ──────────────────────────────────────────────
create table competition_draft_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null unique references competitions (id) on delete cascade,
  is_enabled boolean not null default false,
  mode draft_mode not null default 'exclusive',
  access_type draft_access_type not null default 'free',
  draft_fee_minor_units integer,
  currency_code char(3),
  opens_at timestamptz,
  closes_at timestamptz,
  max_assignments_per_user integer not null default 1 check (max_assignments_per_user >= 1),
  allow_changes_before_close boolean not null default false,
  visibility draft_visibility not null default 'public',
  status draft_status not null default 'draft',
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- FREE: fee must be null or zero. PAID: fee > 0 and currency required.
  constraint chk_draft_fee check (
    (access_type <> 'paid' and (draft_fee_minor_units is null or draft_fee_minor_units = 0))
    or (access_type = 'paid' and draft_fee_minor_units is not null and draft_fee_minor_units > 0 and currency_code is not null)
  ),
  constraint chk_draft_window check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create index idx_draft_settings_tenant on competition_draft_settings (tenant_id);

create trigger trg_draft_settings_updated_at
  before update on competition_draft_settings
  for each row execute function app.set_updated_at();

-- ── draft_scoring_rules ─────────────────────────────────────────────────────
create table draft_scoring_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  scoring_type draft_scoring_type not null default 'competition_points',
  -- e.g. {"position_points": {"1":10,"2":8,"3":6,"4":5,"5":4,"6":3,"7":2,"8":1}}
  config jsonb not null default '{"position_points": {}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id)
);
create index idx_draft_scoring_tenant on draft_scoring_rules (tenant_id);

create trigger trg_draft_scoring_updated_at
  before update on draft_scoring_rules
  for each row execute function app.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table competition_draft_settings enable row level security;
alter table draft_scoring_rules enable row level security;

-- Public draft settings are readable for non-draft competitions (so users can see
-- the draft section); private visibility handled at the app layer + assignments.
create policy draft_settings_select on competition_draft_settings for select
  using (
    app.is_super_admin() or app.owns_competition(competition_id)
    or exists (select 1 from competitions c where c.id = competition_id and c.status <> 'draft')
  );
create policy draft_settings_write on competition_draft_settings for all
  using (app.is_super_admin() or app.owns_competition(competition_id))
  with check (app.is_super_admin() or app.owns_competition(competition_id));

create policy draft_scoring_select on draft_scoring_rules for select using (true);
create policy draft_scoring_write on draft_scoring_rules for all
  using (app.is_super_admin() or app.owns_competition(competition_id))
  with check (app.is_super_admin() or app.owns_competition(competition_id));
