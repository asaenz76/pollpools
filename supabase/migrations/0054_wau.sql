-- ============================================================================
-- 0054_wau — Phase 8-B.5 GRE.2: Weekly Active Users (configurable, set-based).
--
-- WAU is the primary growth signal. Its definition is CONFIGURATION (which
-- signals count, the window, and the minimum qualifying actions) held on
-- platform_config — the Super Admin owns it; no hard-coded thresholds. A user is
-- active if their qualifying actions across the enabled signals meet the minimum
-- within the window. Computed purely set-based from existing engagement tables
-- (predictions, confirmed drafts) plus a lightweight login-activity rollup.
-- ============================================================================

alter table platform_config
  add column if not exists wau_window_days integer not null default 7 check (wau_window_days > 0),
  add column if not exists wau_min_actions integer not null default 1 check (wau_min_actions > 0),
  add column if not exists wau_signal_prediction boolean not null default true,
  add column if not exists wau_signal_draft boolean not null default true,
  add column if not exists wau_signal_login boolean not null default true;

-- Login/activity rollup — one row per tenant/user/day. The only signal not already
-- derivable from an engagement table. Stamped by app.record_tenant_activity.
create table tenant_user_activity (
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  activity_date date not null,
  action_count integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, activity_date)
);
create index idx_tenant_user_activity_window on tenant_user_activity (tenant_id, activity_date);

alter table tenant_user_activity enable row level security;
create policy tenant_user_activity_read on tenant_user_activity for select
  using (app.is_super_admin() or app.is_tenant_member(tenant_id));

-- Stamp a login/session activity for today (idempotent per day; increments count).
create or replace function app.record_tenant_activity(p_tenant uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into tenant_user_activity (tenant_id, user_id, activity_date, action_count)
  values (p_tenant, p_user, current_date, 1)
  on conflict (tenant_id, user_id, activity_date)
    do update set action_count = tenant_user_activity.action_count + 1, updated_at = now();
end; $$;
grant execute on function app.record_tenant_activity(uuid, uuid) to authenticated, service_role;

-- Public wrapper the session path calls. Uses auth.uid() so a user can only ever
-- stamp their OWN activity (no spoofing another user). Anon is a silent no-op.
create or replace function public.record_tenant_activity(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform app.record_tenant_activity(p_tenant, auth.uid());
end; $$;
grant execute on function public.record_tenant_activity(uuid) to authenticated, service_role;

-- Core WAU: distinct users whose qualifying actions across the enabled signals
-- meet the minimum within [p_from, p_to). Toggling a signal off drops its rows.
create or replace function app.tenant_wau(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_min_actions int,
  p_sig_pred boolean, p_sig_draft boolean, p_sig_login boolean
) returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select user_id from (
      select user_id from predictions
        where p_sig_pred and tenant_id = p_tenant and submitted_at >= p_from and submitted_at < p_to
      union all
      select user_id from competitor_draft_assignments
        where p_sig_draft and tenant_id = p_tenant and confirmed_at is not null
          and confirmed_at >= p_from and confirmed_at < p_to
      union all
      select user_id from tenant_user_activity
        where p_sig_login and tenant_id = p_tenant
          and activity_date >= p_from::date
          -- Include the final day when p_to is mid-day (e.g. now()); a clean
          -- midnight upper bound stays exclusive so adjacent windows don't overlap.
          and activity_date < (p_to::date + (p_to > date_trunc('day', p_to))::int)
    ) actions
    group by user_id
    having count(*) >= p_min_actions
  ) active;
$$;

-- Admin-only parameterized WAU (for what-if analysis + the Audience Growth metric
-- + tests). Guarded to super_admin / service_role — not a tenant-facing API.
create or replace function public.tenant_wau_at(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_min_actions int default 1,
  p_sig_pred boolean default true, p_sig_draft boolean default true, p_sig_login boolean default true
) returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then raise exception 'NOT_AUTHORIZED'; end if;
  return app.tenant_wau(p_tenant, p_from, p_to, p_min_actions, p_sig_pred, p_sig_draft, p_sig_login);
end; $$;
grant execute on function public.tenant_wau_at(uuid, timestamptz, timestamptz, int, boolean, boolean, boolean) to service_role;

-- Public wrapper: current + previous-window WAU using the configured definition.
-- Guarded to the tenant's own members, the Super Admin, or service_role.
create or replace function public.tenant_wau_current(p_tenant uuid, p_as_of timestamptz default now())
returns table (current_wau int, previous_wau int, window_days int)
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin() or app.is_tenant_member(p_tenant)) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select wau_window_days, wau_min_actions, wau_signal_prediction, wau_signal_draft, wau_signal_login
    into c from platform_config limit 1;
  window_days := coalesce(c.wau_window_days, 7);
  current_wau := app.tenant_wau(p_tenant, p_as_of - make_interval(days => window_days), p_as_of,
    coalesce(c.wau_min_actions, 1), coalesce(c.wau_signal_prediction, true), coalesce(c.wau_signal_draft, true), coalesce(c.wau_signal_login, true));
  previous_wau := app.tenant_wau(p_tenant, p_as_of - make_interval(days => window_days * 2), p_as_of - make_interval(days => window_days),
    coalesce(c.wau_min_actions, 1), coalesce(c.wau_signal_prediction, true), coalesce(c.wau_signal_draft, true), coalesce(c.wau_signal_login, true));
  return next;
end; $$;
grant execute on function public.tenant_wau_current(uuid, timestamptz) to authenticated, service_role;
