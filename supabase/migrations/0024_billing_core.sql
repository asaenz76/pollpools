-- ============================================================================
-- 0024_billing_core.sql  (Phase 7 — Monetization)
-- Provider-neutral billing core: customers, products, checkouts, orders,
-- subscriptions, refunds, webhook events, entitlements. Everything tenant-scoped.
-- Entitlements are derived from VERIFIED billing records only — never a redirect.
-- ============================================================================

create type billing_provider_type as enum ('lemon_squeezy', 'mock', 'manual', 'future');
create type billing_product_type as enum ('platform_premium', 'creator_support', 'paid_competitor_draft');
create type billing_product_status as enum ('active', 'inactive', 'archived');
create type billing_interval_type as enum ('one_time', 'monthly', 'yearly');
create type billing_checkout_status as enum ('pending', 'open', 'completed', 'expired', 'failed');
create type billing_order_status as enum ('paid', 'pending', 'partially_refunded', 'refunded', 'failed');
create type billing_refund_status as enum ('pending', 'succeeded', 'failed');
create type webhook_processing_status as enum ('received', 'processed', 'failed', 'skipped');
create type billing_entitlement_type as enum ('platform_premium', 'creator_supporter', 'paid_draft_access', 'premium_reward_period');
create type entitlement_source_type as enum ('subscription', 'order', 'prize_award', 'admin_grant');
create type entitlement_status as enum ('active', 'expired', 'revoked');

-- ── billing_customers ────────────────────────────────────────────────────────
create table billing_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  provider billing_provider_type not null,
  provider_customer_id text not null,
  email text,
  name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (tenant_id, user_id, provider)
);
create index idx_billing_customers_user on billing_customers (tenant_id, user_id);

create trigger trg_billing_customers_updated_at before update on billing_customers
  for each row execute function app.set_updated_at();

-- ── billing_products ─────────────────────────────────────────────────────────
create table billing_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  product_type billing_product_type not null,
  name text not null,
  description text,
  provider billing_provider_type not null,
  provider_product_id text,
  provider_variant_id text,
  status billing_product_status not null default 'active',
  currency_code char(3) not null,
  price_minor_units integer not null check (price_minor_units > 0),
  billing_interval billing_interval_type,
  creator_id uuid references creators (id) on delete cascade,
  competition_id uuid references competitions (id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_product_shape check (
    (product_type = 'creator_support' and creator_id is not null and competition_id is null)
    or (product_type = 'paid_competitor_draft' and competition_id is not null)
    or (product_type = 'platform_premium' and creator_id is null and competition_id is null)
  )
);
create index idx_billing_products_tenant on billing_products (tenant_id, product_type, status);
create index idx_billing_products_creator on billing_products (creator_id);
create index idx_billing_products_competition on billing_products (competition_id);

create trigger trg_billing_products_updated_at before update on billing_products
  for each row execute function app.set_updated_at();

-- ── billing_checkouts ────────────────────────────────────────────────────────
create table billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  billing_product_id uuid not null references billing_products (id) on delete cascade,
  provider billing_provider_type not null,
  provider_checkout_id text,
  checkout_url text,
  status billing_checkout_status not null default 'pending',
  idempotency_key text not null unique,
  expires_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_billing_checkouts_user on billing_checkouts (tenant_id, user_id);

create trigger trg_billing_checkouts_updated_at before update on billing_checkouts
  for each row execute function app.set_updated_at();

-- ── billing_orders ───────────────────────────────────────────────────────────
create table billing_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  billing_product_id uuid not null references billing_products (id) on delete restrict,
  billing_checkout_id uuid references billing_checkouts (id) on delete set null,
  provider billing_provider_type not null,
  provider_order_id text not null,
  provider_customer_id text,
  status billing_order_status not null,
  subtotal_minor_units integer not null,
  tax_minor_units integer not null default 0,
  total_minor_units integer not null,
  currency_code char(3) not null,
  refunded_minor_units integer not null default 0,
  purchased_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);
create index idx_billing_orders_user on billing_orders (tenant_id, user_id, purchased_at desc);

create trigger trg_billing_orders_updated_at before update on billing_orders
  for each row execute function app.set_updated_at();

-- ── billing_subscriptions ────────────────────────────────────────────────────
create table billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  billing_product_id uuid not null references billing_products (id) on delete restrict,
  creator_id uuid references creators (id) on delete set null,
  provider billing_provider_type not null,
  provider_subscription_id text not null,
  provider_customer_id text,
  status subscription_status not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index idx_billing_subs_user on billing_subscriptions (tenant_id, user_id);
create index idx_billing_subs_creator on billing_subscriptions (creator_id) where creator_id is not null;
-- One active support subscription per user per creator (spec §7).
create unique index uq_active_support_per_creator on billing_subscriptions (tenant_id, user_id, creator_id)
  where creator_id is not null and status in ('trialing', 'active', 'past_due');

create trigger trg_billing_subs_updated_at before update on billing_subscriptions
  for each row execute function app.set_updated_at();

-- ── billing_refunds ──────────────────────────────────────────────────────────
create table billing_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  billing_order_id uuid not null references billing_orders (id) on delete cascade,
  provider billing_provider_type not null,
  provider_refund_id text,
  amount_minor_units integer not null check (amount_minor_units >= 0),
  currency_code char(3) not null,
  status billing_refund_status not null,
  reason text,
  initiated_by uuid references users (id) on delete set null,
  processed_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index idx_billing_refunds_order on billing_refunds (billing_order_id);

-- ── billing_webhook_events — the replay/idempotency ledger ───────────────────
create table billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider billing_provider_type not null,
  provider_event_id text not null,
  event_type text not null,
  signature_verified boolean not null,
  processing_status webhook_processing_status not null default 'received',
  payload_hash text not null,
  raw_payload jsonb not null,
  attempts integer not null default 0,
  processed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index idx_webhook_events_status on billing_webhook_events (processing_status, created_at);

create trigger trg_webhook_events_updated_at before update on billing_webhook_events
  for each row execute function app.set_updated_at();

-- ── billing_entitlements — derived access grants ─────────────────────────────
create table billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  entitlement_type billing_entitlement_type not null,
  source_type entitlement_source_type not null,
  source_id uuid not null,
  creator_id uuid references creators (id) on delete cascade,
  competition_id uuid references competitions (id) on delete cascade,
  status entitlement_status not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- One entitlement per (user, type, source) — idempotent grants.
  unique (tenant_id, user_id, entitlement_type, source_type, source_id)
);
create index idx_entitlements_user on billing_entitlements (tenant_id, user_id, entitlement_type) where status = 'active';
create index idx_entitlements_creator on billing_entitlements (creator_id) where creator_id is not null;
