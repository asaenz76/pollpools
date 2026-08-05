-- ============================================================================
-- 0025_billing_rls.sql  (Phase 7)
-- RLS for billing core. Users read only their own records; writes go through
-- SECURITY DEFINER functions / service role (no direct client write policies),
-- except product configuration by super admin / owning creator.
-- ============================================================================

alter table billing_customers      enable row level security;
alter table billing_products       enable row level security;
alter table billing_checkouts      enable row level security;
alter table billing_orders         enable row level security;
alter table billing_subscriptions  enable row level security;
alter table billing_refunds        enable row level security;
alter table billing_webhook_events enable row level security;
alter table billing_entitlements   enable row level security;

-- Customers: owner + super admin.
create policy billing_customers_select on billing_customers for select
  using (user_id = auth.uid() or app.is_super_admin());

-- Products: publicly readable (pricing pages); writable by super admin, or by
-- the owning creator for their own creator_support product.
create policy billing_products_select on billing_products for select using (true);
create policy billing_products_write on billing_products for all
  using (app.is_super_admin() or (product_type = 'creator_support' and creator_id is not null and app.owns_creator(creator_id)))
  with check (app.is_super_admin() or (product_type = 'creator_support' and creator_id is not null and app.owns_creator(creator_id)));

-- Checkouts / orders / subscriptions: owner + super admin (writes via functions).
create policy billing_checkouts_select on billing_checkouts for select
  using (user_id = auth.uid() or app.is_super_admin());
create policy billing_orders_select on billing_orders for select
  using (user_id = auth.uid() or app.is_super_admin());
create policy billing_subscriptions_select on billing_subscriptions for select
  using (user_id = auth.uid() or app.is_super_admin());

-- Refunds: the order's user + super admin.
create policy billing_refunds_select on billing_refunds for select
  using (
    app.is_super_admin()
    or exists (select 1 from billing_orders o where o.id = billing_order_id and o.user_id = auth.uid())
  );

-- Webhook events: super admin only (no user/anon access at all).
create policy billing_webhook_events_select on billing_webhook_events for select
  using (app.is_super_admin());

-- Entitlements: owner + super admin (the app checks these to unlock features).
create policy billing_entitlements_select on billing_entitlements for select
  using (user_id = auth.uid() or app.is_super_admin());
