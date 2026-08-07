-- ============================================================================
-- 0057_success_timeline — Phase 8-B.5 GRE.5: Tenant Success Timeline.
--
-- Celebrates meaningful, POSITIVE progress — not an activity feed, audit log, or
-- billing history. Entries are permanent and never rewritten; if a milestone
-- recurs at a new level, a new entry is appended. Detection is deterministic and
-- idempotent (dedupe_key), derived entirely from existing state — it never writes
-- economics or health.
-- ============================================================================

create table tenant_success_timeline (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  type text not null,
  category text not null,               -- revenue_plan | community_health | audience | competitions | draft | support | platform | achievements
  title text not null,
  description text,
  icon_key text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  visibility text not null default 'tenant',
  is_pinned boolean not null default false,
  is_shareable_eligible boolean not null default false,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);
create index idx_success_timeline_tenant on tenant_success_timeline (tenant_id, occurred_at desc);

alter table tenant_success_timeline enable row level security;
create policy success_timeline_read on tenant_success_timeline for select
  using (app.is_super_admin() or app.is_tenant_member(tenant_id));
create policy success_timeline_write on tenant_success_timeline for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- Append a milestone (permanent; idempotent by dedupe_key).
create or replace function app.record_success_milestone(
  p_tenant uuid, p_type text, p_category text, p_title text, p_description text,
  p_icon text, p_dedupe text, p_metadata jsonb default '{}'::jsonb, p_shareable boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into tenant_success_timeline (tenant_id, type, category, title, description, icon_key, dedupe_key, metadata, is_shareable_eligible)
  values (p_tenant, p_type, p_category, p_title, p_description, p_icon, p_dedupe, p_metadata, p_shareable)
  on conflict (tenant_id, dedupe_key) do nothing;
end; $$;

-- Detect and append any newly-earned milestones for a tenant. Deterministic and
-- POSITIVE-only (no downgrades, no routine actions). Safe to run repeatedly.
create or replace function public.detect_success_milestones(p_tenant uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  before_n int; after_n int;
  v_wau int; v_plan record; v_best int; v_supporters int; v_drafters int;
  v_domain boolean; v_age_days numeric; v_completed int; threshold int;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin() or app.is_tenant_member(p_tenant)) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select count(*) into before_n from tenant_success_timeline where tenant_id = p_tenant;

  -- Revenue plan reached (from immutable assignment history; upgrades only, tier > 0).
  for v_plan in
    select rp.key, rp.display_name, rp.tier, a.assigned_at
    from tenant_revenue_plan_assignments a join revenue_plans rp on rp.id = a.plan_id
    where a.tenant_id = p_tenant and a.assignment_type = 'automatic_upgrade'
  loop
    perform app.record_success_milestone(p_tenant, 'plan_reached', 'revenue_plan',
      'Reached ' || v_plan.display_name, 'Your community qualified for the ' || v_plan.display_name || ' plan.',
      'trophy', 'plan:' || v_plan.key, jsonb_build_object('plan', v_plan.key, 'tier', v_plan.tier), true);
  end loop;

  -- WAU milestones crossed.
  select current_wau into v_wau from tenant_plan_state where tenant_id = p_tenant;
  if v_wau is not null then
    foreach threshold in array array[100, 500, 1000, 5000, 10000] loop
      if v_wau >= threshold then
        perform app.record_success_milestone(p_tenant, 'wau_milestone', 'audience',
          'Reached ' || threshold || ' weekly active users', null, 'users',
          'wau:' || threshold, jsonb_build_object('threshold', threshold), true);
      end if;
    end loop;
  end if;

  -- Community Health personal best (from persisted snapshots).
  select max(overall_score) into v_best from community_health_snapshots where tenant_id = p_tenant and status = 'scored';
  if v_best is not null then
    perform app.record_success_milestone(p_tenant, 'health_personal_best', 'community_health',
      'Community Health personal best: ' || v_best, null, 'sparkline',
      'health_pb:' || v_best, jsonb_build_object('score', v_best), false);
  end if;

  -- Supporters (creator_supporter only — never Platform Support).
  select count(distinct user_id) into v_supporters from billing_entitlements
    where tenant_id = p_tenant and entitlement_type = 'creator_supporter' and status = 'active';
  if v_supporters >= 1 then
    perform app.record_success_milestone(p_tenant, 'first_supporter', 'support', 'First supporter', 'Someone chose to support your community.', 'heart', 'support:1', '{}'::jsonb, false);
  end if;
  if v_supporters >= 100 then
    perform app.record_success_milestone(p_tenant, 'supporters_100', 'support', '100 supporters', null, 'heart', 'support:100', '{}'::jsonb, true);
  end if;

  -- Draft participation milestones.
  select count(distinct user_id) into v_drafters from competitor_draft_assignments where tenant_id = p_tenant and confirmed_at is not null;
  if v_drafters >= 1 then
    perform app.record_success_milestone(p_tenant, 'first_draft', 'draft', 'First Competitor Draft', 'Your community started drafting.', 'flag', 'draft:1', '{}'::jsonb, false);
  end if;
  if v_drafters >= 100 then
    perform app.record_success_milestone(p_tenant, 'draft_100', 'draft', 'First 100 Draft participants', null, 'flag', 'draft:100', '{}'::jsonb, true);
  end if;

  -- First completed competition.
  select count(*) into v_completed from competitions where tenant_id = p_tenant and status = 'completed';
  if v_completed >= 1 then
    perform app.record_success_milestone(p_tenant, 'first_competition', 'competitions', 'First completed competition', null, 'medal', 'competition_completed:1', '{}'::jsonb, true);
  end if;

  -- Custom domain verified.
  select exists (select 1 from tenant_domains where tenant_id = p_tenant and verified) into v_domain;
  if v_domain then
    perform app.record_success_milestone(p_tenant, 'domain_verified', 'platform', 'Custom domain verified', null, 'globe', 'domain_verified', '{}'::jsonb, false);
  end if;

  -- One year on the platform.
  select extract(epoch from (now() - created_at)) / 86400 into v_age_days from tenants where id = p_tenant;
  if v_age_days >= 365 then
    perform app.record_success_milestone(p_tenant, 'one_year', 'platform', 'One year on the platform', null, 'cake', 'one_year', '{}'::jsonb, true);
  end if;

  select count(*) into after_n from tenant_success_timeline where tenant_id = p_tenant;
  return after_n - before_n;
end; $$;
grant execute on function public.detect_success_milestones(uuid) to authenticated, service_role;

create or replace function public.detect_all_success_milestones()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; n int := 0;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then raise exception 'NOT_AUTHORIZED'; end if;
  for t in select id from tenants where status = 'active' loop
    n := n + public.detect_success_milestones(t.id);
  end loop;
  return n;
end; $$;
grant execute on function public.detect_all_success_milestones() to service_role;
