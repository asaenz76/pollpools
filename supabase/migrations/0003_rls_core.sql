-- ============================================================================
-- 0003_rls_core.sql
-- Row Level Security for all Phase 1 tables. Deny-by-default: RLS is enabled on
-- every tenant-owned table and access is granted only through explicit policies.
--
-- Isolation model: a user can only ever touch tenants they belong to (via
-- tenant_memberships) or that are publicly readable (active + published). The
-- application additionally narrows every query to the single request-resolved
-- tenant. The client can never assert a tenant id or a role — those come from
-- the JWT (auth.uid()) and server-side checks only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER (owned by postgres) so they bypass RLS on
-- the lookup tables and cannot recurse through the very policies that call them.
-- ----------------------------------------------------------------------------
grant usage on schema app to anon, authenticated;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_roles r
    where r.user_id = auth.uid()
      and r.role = 'super_admin'
      and r.tenant_id is null
  );
$$;

create or replace function app.is_tenant_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_memberships m
    where m.tenant_id = p_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function app.is_tenant_admin(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from tenant_memberships m
    where m.tenant_id = p_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'admin'
  );
$$;

create or replace function app.owns_creator(p_creator uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from creators c
    where c.id = p_creator
      and c.owner_user_id = auth.uid()
  );
$$;

grant execute on function
  app.is_super_admin(),
  app.is_tenant_member(uuid),
  app.is_tenant_admin(uuid),
  app.owns_creator(uuid)
to anon, authenticated;

-- Prevent creators from self-verifying or self-granting settlement rights.
-- Only a super admin or the trusted service role may change these columns.
create or replace function app.protect_creator_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if (new.verification_status is distinct from old.verification_status
        or new.settlement_enabled is distinct from old.settlement_enabled)
     and not (app.is_super_admin() or coalesce(auth.role(), '') = 'service_role')
  then
    raise exception 'Only a super admin may change creator verification or settlement permissions';
  end if;
  return new;
end;
$$;

create trigger trg_protect_creator_privileged_columns
  before update on creators
  for each row execute function app.protect_creator_privileged_columns();

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ----------------------------------------------------------------------------
alter table tenants               enable row level security;
alter table tenant_domains        enable row level security;
alter table tenant_settings       enable row level security;
alter table tenant_feature_flags  enable row level security;
alter table users                 enable row level security;
alter table profiles              enable row level security;
alter table tenant_memberships    enable row level security;
alter table user_roles            enable row level security;
alter table creators              enable row level security;
alter table creator_channels      enable row level security;
alter table audit_logs            enable row level security;
alter table idempotency_records   enable row level security;
alter table system_jobs           enable row level security;
alter table moderation_reports    enable row level security;

-- ----------------------------------------------------------------------------
-- tenants
-- ----------------------------------------------------------------------------
create policy tenants_select on tenants for select
  using (status = 'active' or app.is_super_admin());
create policy tenants_insert on tenants for insert
  with check (app.is_super_admin());
create policy tenants_update on tenants for update
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy tenants_delete on tenants for delete
  using (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- tenant_domains — verified domains are publicly readable for host resolution.
-- ----------------------------------------------------------------------------
create policy tenant_domains_select on tenant_domains for select
  using (verified or app.is_super_admin());
create policy tenant_domains_write on tenant_domains for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- tenant_settings — branding/config readable for active tenants.
-- ----------------------------------------------------------------------------
create policy tenant_settings_select on tenant_settings for select
  using (
    app.is_super_admin()
    or exists (select 1 from tenants t where t.id = tenant_id and t.status = 'active')
  );
create policy tenant_settings_write on tenant_settings for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- tenant_feature_flags — readable so the UI/feature service can resolve them.
-- ----------------------------------------------------------------------------
create policy tenant_feature_flags_select on tenant_feature_flags for select
  using (
    app.is_super_admin()
    or exists (select 1 from tenants t where t.id = tenant_id and t.status = 'active')
  );
create policy tenant_feature_flags_write on tenant_feature_flags for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- users — self or super admin only. Inserts happen via the auth trigger.
-- ----------------------------------------------------------------------------
create policy users_select on users for select
  using (id = auth.uid() or app.is_super_admin());
create policy users_update on users for update
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- profiles — public profiles readable by anyone; owner manages their own.
-- (public_profiles feature flag is additionally enforced at the app layer.)
-- ----------------------------------------------------------------------------
create policy profiles_select on profiles for select
  using (is_public or user_id = auth.uid() or app.is_super_admin());
create policy profiles_insert on profiles for insert
  with check (user_id = auth.uid());
create policy profiles_update on profiles for update
  using (user_id = auth.uid() or app.is_super_admin())
  with check (user_id = auth.uid() or app.is_super_admin());
create policy profiles_delete on profiles for delete
  using (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- tenant_memberships — self-join as plain member; elevation is admin-only.
-- ----------------------------------------------------------------------------
create policy memberships_select on tenant_memberships for select
  using (user_id = auth.uid() or app.is_super_admin() or app.is_tenant_admin(tenant_id));
create policy memberships_insert on tenant_memberships for insert
  with check (user_id = auth.uid() and role = 'member' and status = 'active');
create policy memberships_update on tenant_memberships for update
  using (app.is_super_admin() or app.is_tenant_admin(tenant_id))
  with check (app.is_super_admin() or app.is_tenant_admin(tenant_id));
create policy memberships_delete on tenant_memberships for delete
  using (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- user_roles — readable by self/super admin; ONLY super admin may write.
-- This is the anti-privilege-escalation gate (no self-granted super_admin).
-- ----------------------------------------------------------------------------
create policy user_roles_select on user_roles for select
  using (user_id = auth.uid() or app.is_super_admin());
create policy user_roles_write on user_roles for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- creators — verified creators are public; owner creates unverified.
-- ----------------------------------------------------------------------------
create policy creators_select on creators for select
  using (
    verification_status = 'verified'
    or owner_user_id = auth.uid()
    or app.is_super_admin()
  );
create policy creators_insert on creators for insert
  with check (
    owner_user_id = auth.uid()
    and verification_status in ('unsubmitted', 'pending')
    and settlement_enabled = false
  );
create policy creators_update on creators for update
  using (owner_user_id = auth.uid() or app.is_super_admin())
  with check (owner_user_id = auth.uid() or app.is_super_admin());
create policy creators_delete on creators for delete
  using (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- creator_channels — public for verified creators; owner manages.
-- ----------------------------------------------------------------------------
create policy creator_channels_select on creator_channels for select
  using (
    app.owns_creator(creator_id)
    or app.is_super_admin()
    or exists (select 1 from creators c where c.id = creator_id and c.verification_status = 'verified')
  );
create policy creator_channels_write on creator_channels for all
  using (app.owns_creator(creator_id) or app.is_super_admin())
  with check (app.owns_creator(creator_id) or app.is_super_admin());

-- ----------------------------------------------------------------------------
-- audit_logs — read-only to super admin / tenant admin. Writes go through the
-- SECURITY DEFINER writer or the service role (no client insert policy).
-- ----------------------------------------------------------------------------
create policy audit_logs_select on audit_logs for select
  using (app.is_super_admin() or (tenant_id is not null and app.is_tenant_admin(tenant_id)));

-- ----------------------------------------------------------------------------
-- idempotency_records & system_jobs — no policies at all → service role only.
-- RLS is enabled with zero policies, so anon/authenticated are fully denied.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- moderation_reports — members file; admins triage.
-- ----------------------------------------------------------------------------
create policy moderation_insert on moderation_reports for insert
  with check (reporter_user_id = auth.uid() and app.is_tenant_member(tenant_id));
create policy moderation_select on moderation_reports for select
  using (
    app.is_super_admin()
    or app.is_tenant_admin(tenant_id)
    or reporter_user_id = auth.uid()
  );
create policy moderation_update on moderation_reports for update
  using (app.is_super_admin() or app.is_tenant_admin(tenant_id))
  with check (app.is_super_admin() or app.is_tenant_admin(tenant_id));
create policy moderation_delete on moderation_reports for delete
  using (app.is_super_admin());
