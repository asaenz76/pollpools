-- ============================================================================
-- 0052_revenue_plans — Phase 8-B.5: Growth & Revenue Engine (economics layer).
--
-- Revenue Plans are PROGRESSION LEVELS assigned to a TENANT (a creator IS a
-- tenant — there is no separate creator commercial model). A plan defines the
-- revenue SHARE per revenue source and its qualification rules. This is NOT a
-- billing/settlement rewrite: it slots a new tier into the existing
-- app.resolve_revenue_split, so historical earnings (which record their split at
-- earn time) never change.
--
-- Business rules encoded here:
--   • Revenue Plans control ECONOMICS; Subscription Plans control FEATURES — they
--     are different systems.
--   • Tenants NEVER edit percentages — only the Super Admin (service_role /
--     super_admin) may write plans, shares, and assignments.
--   • Platform Support (platform_premium) is always 100% platform and never gets
--     a share row — it never participates in revenue sharing.
--   • Plan changes affect FUTURE transactions only; assignment history is
--     immutable.
-- ============================================================================

create type revenue_plan_status as enum ('active', 'manual', 'retired');
create type plan_assignment_type as enum ('initial', 'automatic_upgrade', 'automatic_downgrade', 'manual');

-- ── revenue_plans — platform-owned progression levels ────────────────────────
create table revenue_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text,
  -- Progression order; higher = better plan. Manual/Enterprise plans sit above
  -- the automatic ladder and are only assigned by hand.
  tier integer not null,
  status revenue_plan_status not null default 'active',
  -- The plan new tenants start on (exactly one).
  is_default boolean not null default false,
  -- Qualification rules — entirely configuration (no hard-coded thresholds).
  -- Shape: { "min_wau": int, "remain_wau": int, "min_account_age_days": int,
  --          "require_verification": bool, "require_good_standing": bool }
  -- remain_wau < min_wau provides anti-flapping hysteresis.
  qualification jsonb not null default '{}'::jsonb,
  -- Which optional features this plan permits (e.g. premium_features, sponsorships).
  feature_eligibility jsonb not null default '{}'::jsonb,
  -- Days a tenant stays At Risk (below remain threshold) before auto-downgrade.
  grace_period_days integer not null default 14 check (grace_period_days >= 0),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_revenue_plans_one_default on revenue_plans (is_default) where is_default;
create index idx_revenue_plans_tier on revenue_plans (tier);

create trigger trg_revenue_plans_updated_at
  before update on revenue_plans
  for each row execute function app.set_updated_at();

-- ── revenue_plan_shares — the visible "you receive X%, platform fee Y%" ───────
-- Only revenue-SHARING sources get a row. platform_premium (Platform Support) is
-- deliberately excluded: it is always 100% platform.
create table revenue_plan_shares (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references revenue_plans (id) on delete cascade,
  product_type billing_product_type not null,
  creator_share_basis_points integer not null check (creator_share_basis_points between 0 and 10000),
  platform_share_basis_points integer not null check (platform_share_basis_points between 0 and 10000),
  constraint chk_plan_share_split check (creator_share_basis_points + platform_share_basis_points = 10000),
  constraint chk_plan_share_not_platform_premium check (product_type <> 'platform_premium'),
  unique (plan_id, product_type)
);

-- ── tenant_revenue_plan_assignments — IMMUTABLE history ──────────────────────
-- The current plan is the row with ended_at is null. Superseding an assignment
-- only sets ended_at; rows are never rewritten.
create table tenant_revenue_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  plan_id uuid not null references revenue_plans (id) on delete restrict,
  assignment_type plan_assignment_type not null,
  reason text,
  assigned_by uuid references users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index uq_tenant_current_plan on tenant_revenue_plan_assignments (tenant_id) where ended_at is null;
create index idx_plan_assignments_tenant on tenant_revenue_plan_assignments (tenant_id, assigned_at desc);

alter table revenue_plans enable row level security;
alter table revenue_plan_shares enable row level security;
alter table tenant_revenue_plan_assignments enable row level security;

-- Plans + shares are publicly readable (transparency — tenants VIEW their share);
-- only the Super Admin may write them.
create policy revenue_plans_read on revenue_plans for select using (true);
create policy revenue_plans_write on revenue_plans for all
  using (app.is_super_admin()) with check (app.is_super_admin());
create policy revenue_plan_shares_read on revenue_plan_shares for select using (true);
create policy revenue_plan_shares_write on revenue_plan_shares for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- A tenant reads its own assignment history; the Super Admin reads all.
create policy plan_assignments_read on tenant_revenue_plan_assignments for select
  using (app.is_super_admin() or app.is_tenant_member(tenant_id));
create policy plan_assignments_write on tenant_revenue_plan_assignments for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- The tenant's current plan id (assignment with no ended_at), or null.
create or replace function app.tenant_current_plan(p_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select plan_id from tenant_revenue_plan_assignments
  where tenant_id = p_tenant and ended_at is null
  limit 1;
$$;

-- Assign a plan to a tenant, preserving immutable history. Closes the current
-- assignment (sets ended_at) and inserts a new one. Super-admin / service-role
-- only. Idempotent when the target plan already is the current plan.
create or replace function public.assign_revenue_plan(
  p_tenant uuid, p_plan_key text, p_type plan_assignment_type, p_reason text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan uuid;
  v_current uuid;
begin
  if not (app.is_super_admin() or auth.role() = 'service_role') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select id into v_plan from revenue_plans where key = p_plan_key;
  if v_plan is null then raise exception 'PLAN_NOT_FOUND: %', p_plan_key; end if;

  v_current := app.tenant_current_plan(p_tenant);
  if v_current = v_plan then return v_plan; end if; -- no-op

  update tenant_revenue_plan_assignments
     set ended_at = now()
   where tenant_id = p_tenant and ended_at is null;

  insert into tenant_revenue_plan_assignments (tenant_id, plan_id, assignment_type, reason, assigned_by)
  values (p_tenant, v_plan, p_type, p_reason, case when auth.role() = 'service_role' then null else auth.uid() end);

  return v_plan;
end; $$;

grant execute on function public.assign_revenue_plan(uuid, text, plan_assignment_type, text) to authenticated, service_role;

-- ── Split integration: plan share as a new tier ──────────────────────────────
-- Resolution order (most specific first): per-creator revenue rule → the tenant's
-- current Revenue Plan share → tenant default → platform floor. Additive: a tenant
-- with no plan assignment resolves exactly as before.
create or replace function app.resolve_revenue_split(p_tenant uuid, p_creator uuid, p_type billing_product_type)
returns table (creator_bps int, platform_bps int)
language sql stable security definer set search_path = public as $$
  -- Order: per-creator rule → tenant PLAN share → tenant default → platform default
  -- floor (platform_config, F-11). A tenant with no plan resolves exactly as before.
  select coalesce(r.creator_share_basis_points, p.creator_share_basis_points, s.creator_share_bps, pc.default_creator_share_bps),
         coalesce(r.platform_share_basis_points, p.platform_share_basis_points, s.platform_share_bps, pc.default_platform_share_bps)
  from (select 1) one
  left join lateral (
    select creator_share_basis_points, platform_share_basis_points
    from creator_revenue_rules rr
    where rr.tenant_id = p_tenant and rr.creator_id = p_creator and rr.product_type = p_type
      and rr.effective_from <= now() and (rr.effective_to is null or rr.effective_to > now())
    order by rr.effective_from desc limit 1
  ) r on true
  left join lateral (
    select ps.creator_share_basis_points, ps.platform_share_basis_points
    from tenant_revenue_plan_assignments a
    join revenue_plan_shares ps on ps.plan_id = a.plan_id and ps.product_type = p_type
    where a.tenant_id = p_tenant and a.ended_at is null
    limit 1
  ) p on true
  left join tenant_settings s on s.tenant_id = p_tenant
  left join platform_config pc on pc.id;
$$;

-- Public, callable wrapper exposing the effective split (plan share, or per-creator
-- override) for transparency displays and tests. Read-only; never mutates.
create or replace function public.effective_revenue_split(p_tenant uuid, p_creator uuid, p_type billing_product_type)
returns table (creator_bps int, platform_bps int)
language sql stable security definer set search_path = public as $$
  select * from app.resolve_revenue_split(p_tenant, p_creator, p_type);
$$;
grant execute on function public.effective_revenue_split(uuid, uuid, billing_product_type) to anon, authenticated, service_role;
