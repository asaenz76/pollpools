-- ============================================================================
-- 0065_tenant_templates — Phase 8-D: Tenant Template Library (data model).
--
-- Templates are versioned CONFIGURATION BLUEPRINTS, not engine variants. A
-- published version is IMMUTABLE; changing it means creating a new version.
-- Creating a tenant from a template records an immutable snapshot of exactly what
-- was applied. The tenant↔template link is OPTIONAL — existing/legacy tenants
-- have template_id = null and are never forced into a template or rewritten.
-- No template-specific tables leak into the engine; config maps onto the existing
-- tenant systems (tenant_settings / feature flags / vocabulary / theme / …).
-- ============================================================================

create type template_status as enum ('draft', 'published', 'retired');

create table tenant_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null default 'general',
  status template_status not null default 'draft',
  latest_version integer not null default 0,
  icon_key text,
  preview_image_url text,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_tenant_templates_updated_at before update on tenant_templates
  for each row execute function app.set_updated_at();

-- A concrete, versioned blueprint. configuration + seed_definition are validated
-- in TS at publish time; once published (published_at set) the row is immutable.
create table tenant_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references tenant_templates (id) on delete cascade,
  version integer not null,
  engine_version text not null,
  configuration jsonb not null default '{}'::jsonb,
  seed_definition jsonb,
  changelog text,
  published_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
create index idx_template_versions_template on tenant_template_versions (template_id, version desc);

-- Immutability: a published version can never be modified or deleted. The publish
-- action sets published_at while it is still null (allowed); any change afterwards
-- is rejected.
create or replace function app.protect_published_template_version()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then raise exception 'TEMPLATE_VERSION_IMMUTABLE'; end if;
    return old;
  end if;
  if old.published_at is not null then raise exception 'TEMPLATE_VERSION_IMMUTABLE'; end if;
  return new;
end; $$;
create trigger trg_protect_published_template_version
  before update or delete on tenant_template_versions
  for each row execute function app.protect_published_template_version();

-- The immutable record of what a tenant was created from (snapshot = exact applied
-- configuration). Never updated after insert.
create table tenant_template_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  template_id uuid not null references tenant_templates (id) on delete restrict,
  template_version integer not null,
  applied_at timestamptz not null default now(),
  applied_by uuid references users (id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (tenant_id)
);
create index idx_template_assignments_template on tenant_template_assignments (template_id, template_version);

create or replace function app.protect_template_assignment()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'TEMPLATE_ASSIGNMENT_IMMUTABLE';
end; $$;
create trigger trg_protect_template_assignment
  before update on tenant_template_assignments
  for each row execute function app.protect_template_assignment();

-- Optional, nullable link on the tenant itself (existing tenants stay null).
alter table tenants
  add column if not exists template_id uuid references tenant_templates (id) on delete set null,
  add column if not exists template_version integer;

-- ── RLS — Super Admin manages templates; tenants never see internal blueprints ──
alter table tenant_templates enable row level security;
alter table tenant_template_versions enable row level security;
alter table tenant_template_assignments enable row level security;

create policy tenant_templates_admin on tenant_templates for all
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy tenant_template_versions_admin on tenant_template_versions for all
  using (app.is_super_admin()) with check (app.is_super_admin());
-- A tenant may read only its OWN assignment; the Super Admin reads all.
create policy tenant_template_assignments_read on tenant_template_assignments for select
  using (app.is_super_admin() or app.is_tenant_member(tenant_id));
create policy tenant_template_assignments_write on tenant_template_assignments for all
  using (app.is_super_admin()) with check (app.is_super_admin());
