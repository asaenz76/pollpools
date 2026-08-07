-- ============================================================================
-- 0055_plan_automation — Phase 8-B.5 GRE.3: automatic upgrade/downgrade.
--
-- Revenue Plan qualification is explicit and transparent: WAU (with hysteresis),
-- account age, good standing, and optional verification. Upgrades apply
-- immediately; downgrades go through a grace period (At Risk) and can be
-- recovered from. Everything is configuration (plan.qualification / grace) — no
-- hard-coded thresholds. Assignment history stays immutable (assign_revenue_plan).
-- Community Health is NEVER an input here.
-- ============================================================================

create type plan_qualification_status as enum ('qualified', 'at_risk');

-- Mutable operational state (the immutable record is the assignment history).
create table tenant_plan_state (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  status plan_qualification_status not null default 'qualified',
  current_wau integer not null default 0,
  at_risk_since timestamptz,
  grace_ends_at timestamptz,
  manual_override boolean not null default false,
  override_reason text,
  override_by uuid references users (id) on delete set null,
  override_at timestamptz,
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table tenant_plan_state enable row level security;
create policy tenant_plan_state_read on tenant_plan_state for select
  using (app.is_super_admin() or app.is_tenant_member(tenant_id));
create policy tenant_plan_state_write on tenant_plan_state for all
  using (app.is_super_admin()) with check (app.is_super_admin());

create trigger trg_tenant_plan_state_updated_at
  before update on tenant_plan_state
  for each row execute function app.set_updated_at();

-- Does a tenant meet a plan's qualification at the ENTER (min_wau) or REMAIN
-- (remain_wau) threshold, given a measured WAU?
create or replace function app.tenant_meets_plan(p_tenant uuid, p_plan uuid, p_wau int, p_use_remain boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare q jsonb; wau_req int; age_req int; t record;
begin
  select qualification into q from revenue_plans where id = p_plan;
  if q is null then return false; end if;
  wau_req := coalesce((q->>(case when p_use_remain then 'remain_wau' else 'min_wau' end))::int, 0);
  if p_wau < wau_req then return false; end if;

  select status, created_at into t from tenants where id = p_tenant;
  age_req := coalesce((q->>'min_account_age_days')::int, 0);
  if extract(epoch from (now() - t.created_at)) < age_req * 86400 then return false; end if;
  if coalesce((q->>'require_good_standing')::boolean, false) and t.status <> 'active' then return false; end if;
  if coalesce((q->>'require_verification')::boolean, false)
     and not exists (select 1 from creators c where c.tenant_id = p_tenant and c.verification_status = 'verified') then
    return false;
  end if;
  return true;
end; $$;

-- Evaluate one tenant: upgrade immediately, or enter/keep/recover/exit grace and
-- downgrade when grace expires. Manual override suspends automation.
create or replace function public.evaluate_tenant_plan(p_tenant uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  st tenant_plan_state; wau int; cur_plan uuid; cur_tier int; cfg record;
  up record; down record; result text := 'unchanged';
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then raise exception 'NOT_AUTHORIZED'; end if;

  insert into tenant_plan_state (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  select * into st from tenant_plan_state where tenant_id = p_tenant;

  select wau_window_days, wau_min_actions, wau_signal_prediction, wau_signal_draft, wau_signal_login into cfg from platform_config limit 1;
  wau := app.tenant_wau(p_tenant, now() - make_interval(days => coalesce(cfg.wau_window_days,7)), now(),
    coalesce(cfg.wau_min_actions,1), coalesce(cfg.wau_signal_prediction,true), coalesce(cfg.wau_signal_draft,true), coalesce(cfg.wau_signal_login,true));

  cur_plan := app.tenant_current_plan(p_tenant);
  select tier into cur_tier from revenue_plans where id = cur_plan;

  if st.manual_override then
    update tenant_plan_state set current_wau = wau, last_evaluated_at = now() where tenant_id = p_tenant;
    return 'manual_override';
  end if;

  -- Upgrade: highest active (non-manual) plan above the current tier meeting the ENTER threshold.
  select id, key, tier into up from revenue_plans
   where status = 'active' and tier > coalesce(cur_tier, -1) and app.tenant_meets_plan(p_tenant, id, wau, false)
   order by tier desc limit 1;
  if up.id is not null then
    perform public.assign_revenue_plan(p_tenant, up.key, 'automatic_upgrade', 'Qualified: WAU ' || wau);
    update tenant_plan_state set status='qualified', current_wau=wau, at_risk_since=null, grace_ends_at=null, last_evaluated_at=now() where tenant_id=p_tenant;
    return 'upgraded:' || up.key;
  end if;

  -- Downgrade path: still meets the REMAIN threshold of the current plan?
  if app.tenant_meets_plan(p_tenant, cur_plan, wau, true) then
    update tenant_plan_state set status='qualified', current_wau=wau, at_risk_since=null, grace_ends_at=null, last_evaluated_at=now() where tenant_id=p_tenant;
    return case when st.status='at_risk' then 'recovered' else 'unchanged' end;
  end if;

  -- Below remain threshold.
  if st.status <> 'at_risk' then
    update tenant_plan_state
       set status='at_risk', current_wau=wau, at_risk_since=now(),
           grace_ends_at = now() + make_interval(days => (select grace_period_days from revenue_plans where id=cur_plan)),
           last_evaluated_at=now()
     where tenant_id=p_tenant;
    return 'at_risk';
  elsif now() >= st.grace_ends_at then
    -- Grace expired: drop to the highest active plan at/below current tier whose REMAIN is met, else the default.
    select id, key, tier into down from revenue_plans
     where status='active' and tier < coalesce(cur_tier, 999) and app.tenant_meets_plan(p_tenant, id, wau, true)
     order by tier desc limit 1;
    if down.id is null then
      select id, key into down from revenue_plans where is_default limit 1;
    end if;
    perform public.assign_revenue_plan(p_tenant, down.key, 'automatic_downgrade', 'Grace expired: WAU ' || wau);
    update tenant_plan_state set status='qualified', current_wau=wau, at_risk_since=null, grace_ends_at=null, last_evaluated_at=now() where tenant_id=p_tenant;
    return 'downgraded:' || down.key;
  else
    update tenant_plan_state set current_wau=wau, last_evaluated_at=now() where tenant_id=p_tenant; -- still in grace
    return 'at_risk';
  end if;
end; $$;
grant execute on function public.evaluate_tenant_plan(uuid) to service_role;

-- Evaluate every active tenant (scheduled entry point).
create or replace function public.evaluate_all_tenant_plans()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; n int := 0;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then raise exception 'NOT_AUTHORIZED'; end if;
  for t in select id from tenants where status = 'active' loop
    perform public.evaluate_tenant_plan(t.id);
    n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.evaluate_all_tenant_plans() to service_role;

-- Manual override: assign a plan by hand and suspend automation (reason required, audited).
create or replace function public.set_plan_override(p_tenant uuid, p_plan_key text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or auth.role() = 'service_role') then raise exception 'NOT_AUTHORIZED'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  perform public.assign_revenue_plan(p_tenant, p_plan_key, 'manual', p_reason);
  insert into tenant_plan_state (tenant_id, manual_override, override_reason, override_by, override_at, status, at_risk_since, grace_ends_at)
  values (p_tenant, true, p_reason, auth.uid(), now(), 'qualified', null, null)
  on conflict (tenant_id) do update set manual_override=true, override_reason=p_reason, override_by=auth.uid(),
    override_at=now(), status='qualified', at_risk_since=null, grace_ends_at=null;
end; $$;
grant execute on function public.set_plan_override(uuid, text, text) to authenticated, service_role;

-- Re-enable automation (keeps the current plan until the next evaluation).
create or replace function public.clear_plan_override(p_tenant uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or auth.role() = 'service_role') then raise exception 'NOT_AUTHORIZED'; end if;
  update tenant_plan_state set manual_override=false, override_reason=p_reason, override_by=auth.uid(), override_at=now()
   where tenant_id = p_tenant;
end; $$;
grant execute on function public.clear_plan_override(uuid, text) to authenticated, service_role;
