-- ============================================================================
-- 0053_revenue_plans_seed — Phase 8-B.5: seed the default Revenue Plan ladder.
--
-- These are EXAMPLE progression levels + shares + qualification thresholds. They
-- are seed CONFIGURATION, fully editable by the Super Admin — nothing here is a
-- hard-coded runtime threshold. Every active tenant is placed on the default
-- plan (Starter) with an immutable initial assignment so the split resolver has a
-- plan to read.
-- ============================================================================

-- Progression ladder. remain_wau < min_wau gives anti-flapping hysteresis
-- (enter Champion at 1000 WAU, remain until it drops below 800).
insert into revenue_plans (key, display_name, description, tier, status, is_default, qualification, feature_eligibility, grace_period_days, display_order)
values
  ('starter', 'Starter', 'Where every community begins.', 0, 'active', true,
   '{"min_wau":0,"remain_wau":0,"min_account_age_days":0,"require_verification":false,"require_good_standing":true}'::jsonb,
   '{"premium_features":false,"sponsorships":false}'::jsonb, 14, 0),
  ('momentum', 'Momentum', 'Your community is picking up speed.', 1, 'active', false,
   '{"min_wau":250,"remain_wau":200,"min_account_age_days":14,"require_verification":false,"require_good_standing":true}'::jsonb,
   '{"premium_features":true,"sponsorships":false}'::jsonb, 14, 1),
  ('champion', 'Champion', 'A thriving, consistent community.', 2, 'active', false,
   '{"min_wau":1000,"remain_wau":800,"min_account_age_days":30,"require_verification":true,"require_good_standing":true}'::jsonb,
   '{"premium_features":true,"sponsorships":true}'::jsonb, 14, 2),
  ('legend', 'Legend', 'Among the very best communities on the platform.', 3, 'active', false,
   '{"min_wau":5000,"remain_wau":4000,"min_account_age_days":60,"require_verification":true,"require_good_standing":true}'::jsonb,
   '{"premium_features":true,"sponsorships":true}'::jsonb, 21, 3),
  ('enterprise', 'Enterprise', 'Custom terms, assigned manually.', 99, 'manual', false,
   '{}'::jsonb,
   '{"premium_features":true,"sponsorships":true}'::jsonb, 30, 4)
on conflict (key) do nothing;

-- Revenue shares per plan (creator% / platform%). Only sharing sources — Platform
-- Support (platform_premium) is always 100% platform and has no row.
insert into revenue_plan_shares (plan_id, product_type, creator_share_basis_points, platform_share_basis_points)
select p.id, v.product_type, v.creator_bps, 10000 - v.creator_bps
from revenue_plans p
join (values
  ('starter',    'creator_support'::billing_product_type,       8000),
  ('starter',    'paid_competitor_draft'::billing_product_type, 8500),
  ('momentum',   'creator_support'::billing_product_type,       8500),
  ('momentum',   'paid_competitor_draft'::billing_product_type, 8800),
  ('champion',   'creator_support'::billing_product_type,       8800),
  ('champion',   'paid_competitor_draft'::billing_product_type, 9000),
  ('legend',     'creator_support'::billing_product_type,       9000),
  ('legend',     'paid_competitor_draft'::billing_product_type, 9200),
  ('enterprise', 'creator_support'::billing_product_type,       9200),
  ('enterprise', 'paid_competitor_draft'::billing_product_type, 9500)
) as v(plan_key, product_type, creator_bps) on v.plan_key = p.key
on conflict (plan_id, product_type) do nothing;

-- Place every active tenant on the default plan with an immutable initial
-- assignment (only when it has none yet).
insert into tenant_revenue_plan_assignments (tenant_id, plan_id, assignment_type, reason)
select t.id, p.id, 'initial', 'Seeded default plan'
from tenants t
cross join revenue_plans p
where p.is_default
  and not exists (
    select 1 from tenant_revenue_plan_assignments a
    where a.tenant_id = t.id and a.ended_at is null
  );

-- Every new tenant starts on the default plan automatically (invariant: a tenant
-- always has a current plan, so the split resolver + growth engine have one to read).
create or replace function app.assign_default_revenue_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan uuid;
begin
  select id into v_plan from revenue_plans where is_default limit 1;
  if v_plan is not null then
    insert into tenant_revenue_plan_assignments (tenant_id, plan_id, assignment_type, reason)
    values (new.id, v_plan, 'initial', 'Default plan on tenant creation');
  end if;
  return new;
end; $$;

create trigger trg_tenant_default_revenue_plan
  after insert on tenants
  for each row execute function app.assign_default_revenue_plan();
