-- ============================================================================
-- 0001_core_tenancy.sql
-- Phase 1 foundation: extensions, domain enums, helper schema, and the core
-- tenancy + identity + creator tables. Generic and sport-agnostic — no table or
-- column here names a vertical.
-- ============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists citext;         -- case-insensitive handles/emails

-- Dedicated schema for helper functions and internal machinery. Not exposed
-- through PostgREST (only `public` is), so these are server/RLS-internal.
create schema if not exists app;

-- ----------------------------------------------------------------------------
-- Domain enums (mirror src/types/enums.ts — keep in lockstep).
-- All enums are declared up front; tables that use them are added per phase.
-- ----------------------------------------------------------------------------
create type tenant_status as enum ('active', 'suspended', 'archived');
create type user_status as enum ('active', 'suspended', 'deleted');
create type global_role as enum ('super_admin', 'creator', 'user');
create type membership_role as enum ('member', 'creator', 'admin');
create type membership_status as enum ('active', 'suspended', 'removed');
create type creator_verification_status as enum
  ('unsubmitted', 'pending', 'verified', 'rejected', 'suspended');
create type competition_type as enum
  ('STANDALONE_EVENT', 'SEASON', 'TOURNAMENT', 'BRACKET');
create type competition_status as enum
  ('draft', 'scheduled', 'active', 'completed', 'canceled', 'archived');
create type stage_kind as enum
  ('qualifier', 'group_stage', 'round_of_64', 'round_of_32', 'round_of_16',
   'quarterfinal', 'semifinal', 'final', 'custom');
create type event_status as enum
  ('draft', 'scheduled', 'published', 'open', 'locked', 'live',
   'waiting_result', 'settlement_pending', 'settled', 'canceled', 'voided');
create type market_type as enum
  ('SINGLE_CHOICE_WINNER', 'YES_NO', 'MULTIPLE_CHOICE');
create type market_status as enum
  ('draft', 'open', 'locked', 'settled', 'canceled', 'voided');
create type option_status as enum
  ('active', 'withdrawn', 'voided', 'winner', 'loser');
create type prediction_status as enum
  ('active', 'locked', 'correct', 'incorrect', 'void');
create type settlement_status as enum
  ('pending', 'active', 'reversed', 'superseded', 'failed');
create type result_source_type as enum
  ('creator_manual', 'super_admin_manual', 'external_provider', 'webhook', 'future_adapter');
create type sentiment_visibility as enum ('always', 'after_prediction', 'after_lock');
create type subscription_status as enum
  ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
create type subscription_product_kind as enum ('platform_premium', 'creator_support');
create type sponsorship_status as enum ('draft', 'active', 'completed', 'canceled');
create type leaderboard_scope as enum ('global', 'creator', 'competition', 'season');
create type feed_activity_type as enum
  ('creator_published_event', 'user_submitted_prediction', 'user_earned_achievement',
   'user_reached_streak_milestone', 'event_settled', 'user_leaderboard_move',
   'creator_published_result', 'sponsored_event_published');
create type notification_type as enum
  ('new_creator_event', 'prediction_opening', 'prediction_locking_soon',
   'event_result_published', 'prediction_correct', 'prediction_incorrect',
   'achievement_earned', 'streak_milestone', 'leaderboard_milestone',
   'creator_followed', 'creator_support_started', 'creator_support_renewed',
   'subscription_failed', 'competition_starting', 'bracket_advancement');

-- ----------------------------------------------------------------------------
-- Shared trigger helpers.
-- ----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- tenants
-- ----------------------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$'),
  display_name text not null,
  tagline text,
  description text,
  status tenant_status not null default 'active',
  default_locale text not null default 'en',
  default_timezone text not null default 'UTC',
  logo_url text,
  icon_url text,
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tenants_status on tenants (status);

create trigger trg_tenants_updated_at
  before update on tenants
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- tenant_domains — subdomain/custom-domain → tenant mapping.
-- ----------------------------------------------------------------------------
create table tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  domain text not null unique,
  is_primary boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_tenant_domains_tenant on tenant_domains (tenant_id);

-- ----------------------------------------------------------------------------
-- tenant_settings — one typed settings row per tenant (+ jsonb extension).
-- ----------------------------------------------------------------------------
create table tenant_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  sentiment_visibility sentiment_visibility not null default 'always',
  small_participation_display boolean not null default true,
  minimum_ranked_predictions integer not null default 5
    check (minimum_ranked_predictions >= 0),
  -- Monetization revenue split, in basis points (0..10000). Never hard-coded in UI.
  platform_share_bps integer not null default 2000
    check (platform_share_bps between 0 and 10000),
  creator_share_bps integer not null default 8000
    check (creator_share_bps between 0 and 10000),
  enabled_competition_types competition_type[] not null
    default array['STANDALONE_EVENT','SEASON','TOURNAMENT','BRACKET']::competition_type[],
  legal_links jsonb not null default '[]'::jsonb,
  footer_links jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_revenue_split_totals_100
    check (platform_share_bps + creator_share_bps = 10000)
);

create trigger trg_tenant_settings_updated_at
  before update on tenant_settings
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- tenant_feature_flags — one row per (tenant, flag).
-- ----------------------------------------------------------------------------
create table tenant_feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  flag text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, flag)
);
create index idx_tenant_feature_flags_tenant on tenant_feature_flags (tenant_id);

create trigger trg_tenant_feature_flags_updated_at
  before update on tenant_feature_flags
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- users — mirror of auth.users. App tables FK here (RLS-friendly) rather than
-- into the auth schema. Soft-deletable so historical predictions survive.
-- ----------------------------------------------------------------------------
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext,
  status user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger trg_users_updated_at
  before update on users
  for each row execute function app.set_updated_at();

-- Keep public.users in sync with auth.users on signup.
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- profiles — per-tenant public identity for a user.
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  handle citext not null
    check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null,
  avatar_url text,
  bio text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, handle)
);
create index idx_profiles_tenant on profiles (tenant_id);
create index idx_profiles_user on profiles (user_id);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- tenant_memberships — scoped role of a user within one tenant.
-- ----------------------------------------------------------------------------
create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role membership_role not null default 'member',
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index idx_memberships_tenant on tenant_memberships (tenant_id);
create index idx_memberships_user on tenant_memberships (user_id);

create trigger trg_memberships_updated_at
  before update on tenant_memberships
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- user_roles — elevated GLOBAL grants (primarily super_admin). A global grant
-- has tenant_id = null. Regular creator/user standing lives in memberships.
-- ----------------------------------------------------------------------------
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  role global_role not null,
  tenant_id uuid references tenants (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index uq_user_roles_global
  on user_roles (user_id, role) where tenant_id is null;
create unique index uq_user_roles_scoped
  on user_roles (user_id, role, tenant_id) where tenant_id is not null;
create index idx_user_roles_user on user_roles (user_id);

-- ----------------------------------------------------------------------------
-- creators
-- ----------------------------------------------------------------------------
create table creators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  owner_user_id uuid not null references users (id) on delete cascade,
  display_name text not null,
  slug text not null
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$'),
  description text,
  avatar_url text,
  banner_url text,
  verification_status creator_verification_status not null default 'unsubmitted',
  supporter_subscriptions_enabled boolean not null default false,
  -- Super-admin-granted permission allowing this creator to settle / ungrade /
  -- regrade THEIR OWN events. Deny-by-default; still audited + step-up + idempotent.
  settlement_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index idx_creators_tenant on creators (tenant_id);
create index idx_creators_owner on creators (owner_user_id);
create index idx_creators_verification on creators (tenant_id, verification_status);

create trigger trg_creators_updated_at
  before update on creators
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- creator_channels — YouTube channels a creator manages.
-- ----------------------------------------------------------------------------
create table creator_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  creator_id uuid not null references creators (id) on delete cascade,
  name text not null,
  youtube_channel_url text,
  youtube_channel_id text,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_creator_channels_creator on creator_channels (creator_id);
create index idx_creator_channels_tenant on creator_channels (tenant_id);

create trigger trg_creator_channels_updated_at
  before update on creator_channels
  for each row execute function app.set_updated_at();
