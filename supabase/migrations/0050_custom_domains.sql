-- ----------------------------------------------------------------------------
-- 0050_custom_domains — Phase 8B.8: first-class custom domains + white label.
--
-- Extends the existing tenant_domains mapping with domain type, a verification
-- lifecycle (with a DNS-TXT token), an SSL status, a primary flag guarantee, and
-- updated_at. Ownership is NEVER trusted: a domain only resolves to its tenant
-- once verification_status = 'verified'. The legacy `verified` boolean is kept as
-- the single value RLS + host resolution read, and is maintained from
-- verification_status by a trigger so there is one source of truth.
-- Additive + backfilled: existing verified rows keep resolving.
-- ----------------------------------------------------------------------------

create type domain_type as enum ('platform', 'custom_subdomain', 'custom_apex');
create type domain_verification_status as enum ('pending', 'verified', 'failed', 'disabled');
create type domain_ssl_status as enum ('pending', 'provisioning', 'active', 'failed', 'disabled');

alter table tenant_domains
  add column if not exists domain_type domain_type not null default 'custom_apex',
  add column if not exists verification_status domain_verification_status not null default 'pending',
  add column if not exists verification_token text,
  add column if not exists ssl_status domain_ssl_status not null default 'pending',
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill: previously-verified rows keep their verified state and get an active
-- SSL status and a verified_at timestamp.
update tenant_domains
   set verification_status = 'verified',
       ssl_status = 'active',
       verified_at = coalesce(verified_at, created_at)
 where verified and verification_status <> 'verified';

-- Keep the legacy `verified` boolean (read by RLS + host resolution) in lockstep
-- with verification_status — single source of truth.
create or replace function app.sync_domain_verified()
returns trigger language plpgsql as $$
begin
  new.verified := (new.verification_status = 'verified');
  if new.verified and new.verified_at is null then
    new.verified_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_tenant_domains_sync_verified
  before insert or update on tenant_domains
  for each row execute function app.sync_domain_verified();

create trigger trg_tenant_domains_updated_at
  before update on tenant_domains
  for each row execute function app.set_updated_at();

-- Exactly one primary domain per tenant.
create unique index if not exists uq_tenant_domains_one_primary
  on tenant_domains (tenant_id) where is_primary;

comment on table tenant_domains is
  'Hostname → tenant mapping. A row resolves only when verification_status = verified '
  '(mirrored to the verified boolean). Exactly one primary per tenant; non-primary '
  'verified hosts redirect to the primary. SSL provisioning is a hosting-platform concern.';
