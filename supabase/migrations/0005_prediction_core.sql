-- ============================================================================
-- 0005_prediction_core.sql
-- Phase 2: the generic prediction domain. Competitions → stages → events →
-- competitors → markets → options → predictions (+ revision history). Nothing
-- here names a vertical; specifics live in labels and JSONB metadata.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- scoring_rules — configurable scoring. V1 implements only the default rule,
-- but the structure supports per-tenant / per-competition rules later.
-- ----------------------------------------------------------------------------
create table scoring_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,   -- null = global
  key text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_scoring_rules_global_key
  on scoring_rules (key) where tenant_id is null;
create unique index uq_scoring_rules_tenant_key
  on scoring_rules (tenant_id, key) where tenant_id is not null;

create trigger trg_scoring_rules_updated_at
  before update on scoring_rules
  for each row execute function app.set_updated_at();

-- The single V1 default rule: correct = 1 point, everything else = 0.
insert into scoring_rules (tenant_id, key, name, config, is_default)
values (null, 'default_v1', 'Default (1 point per correct)',
  '{"correct":1,"incorrect":0,"void":0,"canceled":0,"no_prediction":0}'::jsonb, true);

-- ----------------------------------------------------------------------------
-- competitions — one generic model for all formats (type discriminates).
-- ----------------------------------------------------------------------------
create table competitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid not null references creators (id) on delete cascade,
  type competition_type not null,
  title text not null,
  slug text not null
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$'),
  description text,
  cover_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status competition_status not null default 'draft',
  scoring_rule_id uuid references scoring_rules (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  constraint chk_competition_dates check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create index idx_competitions_tenant on competitions (tenant_id, status);
create index idx_competitions_creator on competitions (creator_id);

create trigger trg_competitions_updated_at
  before update on competitions
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- competition_stages — sequential stages within a tournament/bracket.
-- (Bracket rounds/slots are added in Phase 3.)
-- ----------------------------------------------------------------------------
create table competition_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  kind stage_kind not null default 'custom',
  name text not null,
  sequence integer not null default 0,
  status competition_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, sequence)
);
create index idx_stages_competition on competition_stages (competition_id, sequence);

create trigger trg_stages_updated_at
  before update on competition_stages
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- competitors — the entities users predict about (a marble, a driver, a team…).
-- Vertical-neutral: identity is a label + image + metadata.
-- ----------------------------------------------------------------------------
create table competitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid references creators (id) on delete set null,
  name text not null,
  slug text
    check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$'),
  image_url text,
  color text,
  status text not null default 'active'
    check (status in ('active', 'withdrawn', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index idx_competitors_tenant on competitors (tenant_id, status);
create index idx_competitors_creator on competitors (creator_id);

create trigger trg_competitors_updated_at
  before update on competitors
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- events — a real-world occurrence users predict on.
-- ----------------------------------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid references competitions (id) on delete set null,
  stage_id uuid references competition_stages (id) on delete set null,
  creator_id uuid not null references creators (id) on delete cascade,
  title text not null,
  slug text not null
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$'),
  description text,
  starts_at timestamptz,
  locks_at timestamptz,
  status event_status not null default 'draft',
  youtube_url text,
  external_url text,
  cover_image_url text,
  result_source result_source_type not null default 'creator_manual',
  settlement_status settlement_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index idx_events_tenant_status on events (tenant_id, status);
create index idx_events_competition on events (competition_id);
create index idx_events_creator on events (creator_id);
create index idx_events_upcoming on events (tenant_id, starts_at) where status in ('published', 'open');
create index idx_events_locks_at on events (locks_at) where status = 'open';

create trigger trg_events_updated_at
  before update on events
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- event_competitors — which competitors take part in an event.
-- ----------------------------------------------------------------------------
create table event_competitors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  competitor_id uuid not null references competitors (id) on delete cascade,
  seed integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (event_id, competitor_id)
);
create index idx_event_competitors_event on event_competitors (event_id);
create index idx_event_competitors_competitor on event_competitors (competitor_id);

-- ----------------------------------------------------------------------------
-- markets — a question attached to an event.
-- ----------------------------------------------------------------------------
create table markets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  question text not null,
  type market_type not null default 'SINGLE_CHOICE_WINNER',
  status market_status not null default 'draft',
  sentiment_visibility sentiment_visibility not null default 'always',
  locks_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_markets_event on markets (event_id);
create index idx_markets_tenant_status on markets (tenant_id, status);
create index idx_markets_locks_at on markets (locks_at) where status = 'open';

create trigger trg_markets_updated_at
  before update on markets
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- market_options — the choices in a market; may map to a competitor.
-- ----------------------------------------------------------------------------
create table market_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  market_id uuid not null references markets (id) on delete cascade,
  competitor_id uuid references competitors (id) on delete set null,
  label text not null,
  display_order integer not null default 0,
  color text,
  image_url text,
  status option_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_market_options_market on market_options (market_id, display_order);

create trigger trg_market_options_updated_at
  before update on market_options
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- predictions — one per (market, user). Current + original option retained.
-- ----------------------------------------------------------------------------
create table predictions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  market_id uuid not null references markets (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  option_id uuid not null references market_options (id) on delete restrict,
  original_option_id uuid not null references market_options (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  locked_at timestamptz,
  source text not null default 'web',
  idempotency_key text not null unique,
  status prediction_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  unique (market_id, user_id)
);
create index idx_predictions_market on predictions (market_id);
create index idx_predictions_user on predictions (user_id, submitted_at desc);
create index idx_predictions_option on predictions (option_id);
create index idx_predictions_tenant on predictions (tenant_id);

-- ----------------------------------------------------------------------------
-- prediction_revisions — immutable audit trail of every pick change pre-lock.
-- ----------------------------------------------------------------------------
create table prediction_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  prediction_id uuid not null references predictions (id) on delete cascade,
  market_id uuid not null references markets (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  option_id uuid not null references market_options (id) on delete restrict,
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index idx_prediction_revisions_prediction on prediction_revisions (prediction_id, created_at);
