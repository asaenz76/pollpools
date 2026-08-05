-- ============================================================================
-- 0026_billing_accounting.sql  (Phase 7)
-- Creator revenue rules, IMMUTABLE earnings ledger, manual payouts + allocations,
-- paid-draft provider approvals, and sponsorships (manual, with invoice fields).
-- Earnings/payouts: never edit or delete; refunds/reversals are compensating rows.
-- ============================================================================

create type creator_earning_type as enum ('support_subscription', 'paid_draft', 'adjustment', 'reversal');
create type creator_earning_status as enum ('pending', 'available', 'held', 'reversed', 'paid');
create type creator_payout_status as enum ('requested', 'under_review', 'approved', 'rejected', 'paid', 'canceled');
create type provider_approval_status as enum ('pending', 'approved', 'rejected', 'revoked');
create type sponsorship_invoice_status as enum ('none', 'draft', 'sent', 'partial', 'paid', 'void');

-- ── creator_revenue_rules — bps split; never hard-coded in UI ─────────────────
create table creator_revenue_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid not null references creators (id) on delete cascade,
  product_type billing_product_type not null,
  creator_share_basis_points integer not null check (creator_share_basis_points between 0 and 10000),
  platform_share_basis_points integer not null check (platform_share_basis_points between 0 and 10000),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint chk_revenue_split check (creator_share_basis_points + platform_share_basis_points = 10000)
);
create index idx_revenue_rules_lookup on creator_revenue_rules (tenant_id, creator_id, product_type, effective_from desc);

-- ── creator_earnings — immutable ledger ──────────────────────────────────────
create table creator_earnings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid not null references creators (id) on delete cascade,
  billing_order_id uuid not null references billing_orders (id) on delete restrict,
  billing_subscription_id uuid references billing_subscriptions (id) on delete set null,
  earning_type creator_earning_type not null,
  gross_minor_units integer not null,
  provider_fee_minor_units integer not null default 0,
  tax_minor_units integer not null default 0,
  net_revenue_minor_units integer not null,
  creator_share_minor_units integer not null,
  platform_share_minor_units integer not null,
  currency_code char(3) not null,
  status creator_earning_status not null default 'pending',
  available_at timestamptz,
  reversed_by_id uuid references creator_earnings (id) on delete set null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index idx_earnings_creator on creator_earnings (tenant_id, creator_id, status);

-- ── creator_payout_requests — manual payouts ─────────────────────────────────
create table creator_payout_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid not null references creators (id) on delete cascade,
  amount_minor_units integer not null check (amount_minor_units > 0),
  currency_code char(3) not null,
  status creator_payout_status not null default 'requested',
  payout_method text,
  payout_destination_masked text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  external_reference text,
  notes text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index idx_payout_requests_creator on creator_payout_requests (tenant_id, creator_id, status);

-- ── creator_payout_allocations — link earnings to payouts (one earning once) ─
create table creator_payout_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  payout_request_id uuid not null references creator_payout_requests (id) on delete cascade,
  earning_id uuid not null references creator_earnings (id) on delete restrict,
  amount_minor_units integer not null,
  created_at timestamptz not null default now(),
  unique (earning_id)   -- an earning can be allocated to at most one payout
);
create index idx_payout_allocations_request on creator_payout_allocations (payout_request_id);

-- ── provider_product_approvals — paid-draft production gate ──────────────────
create table provider_product_approvals (
  id uuid primary key default gen_random_uuid(),
  provider billing_provider_type not null,
  product_type billing_product_type not null,
  tenant_id uuid references tenants (id) on delete cascade,
  approval_status provider_approval_status not null default 'pending',
  approval_reference text,
  approved_at timestamptz,
  reviewed_by uuid references users (id) on delete set null,
  notes text,
  evidence_url text,
  created_at timestamptz not null default now()
);
create index idx_provider_approvals_lookup on provider_product_approvals (provider, product_type, tenant_id, approval_status);

-- ── sponsorships (manual; invoice fields for tracking) ───────────────────────
create table sponsorships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid references creators (id) on delete set null,
  competition_id uuid references competitions (id) on delete set null,
  event_id uuid references events (id) on delete set null,
  sponsor_name text not null,
  logo_url text,
  campaign_title text,
  placement text,
  starts_at timestamptz,
  ends_at timestamptz,
  contract_value_minor_units integer,
  creator_share_basis_points integer check (creator_share_basis_points is null or creator_share_basis_points between 0 and 10000),
  platform_share_basis_points integer check (platform_share_basis_points is null or platform_share_basis_points between 0 and 10000),
  status sponsorship_status not null default 'draft',
  invoice_status sponsorship_invoice_status not null default 'none',
  amount_invoiced_minor_units integer,
  amount_received_minor_units integer,
  currency_code char(3),
  received_at timestamptz,
  external_invoice_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sponsorships_tenant on sponsorships (tenant_id, status);

create trigger trg_sponsorships_updated_at before update on sponsorships
  for each row execute function app.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table creator_revenue_rules       enable row level security;
alter table creator_earnings            enable row level security;
alter table creator_payout_requests     enable row level security;
alter table creator_payout_allocations  enable row level security;
alter table provider_product_approvals  enable row level security;
alter table sponsorships                enable row level security;

-- Revenue rules: super admin writes; owning creator + super admin read.
create policy revenue_rules_select on creator_revenue_rules for select
  using (app.is_super_admin() or app.owns_creator(creator_id));
create policy revenue_rules_write on creator_revenue_rules for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- Earnings: owning creator + super admin read; writes via functions only.
create policy earnings_select on creator_earnings for select
  using (app.is_super_admin() or app.owns_creator(creator_id));

-- Payout requests: owning creator creates/reads own; super admin manages.
create policy payout_requests_select on creator_payout_requests for select
  using (app.is_super_admin() or app.owns_creator(creator_id));
create policy payout_requests_insert on creator_payout_requests for insert
  with check (app.owns_creator(creator_id) and status = 'requested');

-- Allocations: owning creator + super admin read; writes via functions.
create policy payout_allocations_select on creator_payout_allocations for select
  using (
    app.is_super_admin()
    or exists (select 1 from creator_payout_requests r where r.id = payout_request_id and app.owns_creator(r.creator_id))
  );

-- Provider approvals: super admin only.
create policy provider_approvals_all on provider_product_approvals for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- Sponsorships: public read active ones; super admin manages.
create policy sponsorships_select on sponsorships for select
  using (app.is_super_admin() or status in ('active', 'completed'));
create policy sponsorships_write on sponsorships for all
  using (app.is_super_admin()) with check (app.is_super_admin());
