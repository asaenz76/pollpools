-- ============================================================================
-- 0015_draft_prizes.sql  (Phase 4.5)
-- Non-monetary prizes + idempotent, reversible awards. Status tracking only —
-- no automated shipping/fulfillment in this phase.
-- ============================================================================

create table competition_prizes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  draft_settings_id uuid references competition_draft_settings (id) on delete set null,
  title text not null,
  description text,
  category prize_category not null,
  placement_from integer check (placement_from is null or placement_from >= 1),
  placement_to integer check (placement_to is null or placement_to >= 1),
  eligibility_rule jsonb not null default '{}'::jsonb,
  image_url text,
  sponsor_id uuid,                       -- FK added with sponsorships (Phase 7)
  fulfillment_owner_type fulfillment_owner_type not null default 'platform',
  fulfillment_owner_id uuid,
  fulfillment_status fulfillment_status not null default 'not_started',
  requires_shipping boolean not null default false,
  geographic_restrictions jsonb not null default '{}'::jsonb,
  age_restrictions jsonb not null default '{}'::jsonb,
  fulfillment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_prize_placement check (placement_to is null or placement_from is null or placement_to >= placement_from)
);
create index idx_prizes_competition on competition_prizes (competition_id);

create trigger trg_prizes_updated_at
  before update on competition_prizes
  for each row execute function app.set_updated_at();

create table prize_awards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_prize_id uuid not null references competition_prizes (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  draft_assignment_id uuid not null references competitor_draft_assignments (id) on delete cascade,
  status prize_award_status not null default 'awarded',
  awarded_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  fulfillment_reference text,
  notes text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index idx_prize_awards_user on prize_awards (tenant_id, user_id);
create index idx_prize_awards_prize on prize_awards (competition_prize_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table competition_prizes enable row level security;
alter table prize_awards enable row level security;

create policy prizes_select on competition_prizes for select
  using (
    app.is_super_admin() or app.owns_competition(competition_id)
    or exists (select 1 from competitions c where c.id = competition_id and c.status <> 'draft')
  );
create policy prizes_write on competition_prizes for all
  using (app.is_super_admin() or app.owns_competition(competition_id))
  with check (app.is_super_admin() or app.owns_competition(competition_id));

-- Awards are public (shown on profiles / standings). Writes via functions.
create policy prize_awards_select on prize_awards for select using (true);
