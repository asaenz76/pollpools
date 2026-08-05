-- ============================================================================
-- 0013_draft_assignments.sql  (Phase 4.5)
-- Draft assignments + provider-agnostic payment records. Exclusivity and
-- one-per-user are enforced by partial unique indexes (not just app logic).
-- ============================================================================

-- ── draft_payments — provider-agnostic; V1 uses a mock/test adapter ─────────
create table draft_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  provider text not null default 'mock',
  provider_reference text not null,
  amount_minor_units integer not null check (amount_minor_units >= 0),
  currency_code char(3) not null,
  status draft_payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (provider, provider_reference)   -- webhook replay guard
);
create index idx_draft_payments_user on draft_payments (tenant_id, user_id);

create trigger trg_draft_payments_updated_at
  before update on draft_payments
  for each row execute function app.set_updated_at();

-- ── competitor_draft_assignments ────────────────────────────────────────────
create table competitor_draft_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  competitor_id uuid not null references competitors (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  status draft_assignment_status not null,
  assignment_source draft_assignment_source not null default 'user_selected',
  payment_status draft_payment_status not null default 'not_required',
  payment_reference_id uuid references draft_payments (id) on delete set null,
  -- True for EXCLUSIVE-mode assignments; scopes the exclusivity unique index so
  -- OPEN mode can share a competitor across users.
  exclusive_slot boolean not null default false,
  reserved_at timestamptz,
  confirmed_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancellation_reason text,
  reservation_expires_at timestamptz,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_draft_assignments_competition on competitor_draft_assignments (competition_id, status);
create index idx_draft_assignments_user on competitor_draft_assignments (tenant_id, user_id);
create index idx_draft_assignments_competitor on competitor_draft_assignments (competition_id, competitor_id);
create index idx_draft_assignments_reservation on competitor_draft_assignments (reservation_expires_at)
  where status in ('reserved', 'pending_payment');

-- One live assignment per user per competition (canceled/expired don't block).
create unique index uq_draft_one_per_user
  on competitor_draft_assignments (competition_id, user_id)
  where status not in ('canceled', 'expired');

-- EXCLUSIVE: one live assignment per competitor per competition.
create unique index uq_draft_exclusive_competitor
  on competitor_draft_assignments (competition_id, competitor_id)
  where exclusive_slot and status not in ('canceled', 'expired');

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table draft_payments enable row level security;
alter table competitor_draft_assignments enable row level security;

-- Payments: owner + super admin only (never cross-user). Writes via functions.
create policy draft_payments_select on draft_payments for select
  using (user_id = auth.uid() or app.is_super_admin());

-- Assignments: own, the competition's creator, or super admin. Public standings
-- are served from draft_leaderboard_snapshots (materialized), not raw rows.
create policy draft_assignments_select on competitor_draft_assignments for select
  using (user_id = auth.uid() or app.is_super_admin() or app.owns_competition(competition_id));
