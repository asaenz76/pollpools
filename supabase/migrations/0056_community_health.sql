-- ============================================================================
-- 0056_community_health — Phase 8-B.5 GRE.4: Community Health (coaching system).
--
-- Community Health COACHES growth. It NEVER determines Revenue Plans, billing,
-- percentages, or qualification. It scores only metrics a tenant can IMPROVE
-- through its own actions (no vanity totals). Five SCORED metrics — Audience
-- Growth, Event Consistency, Prediction Participation, Draft Participation (a
-- first-class PEER of prediction, never blended), Community Support. Operational
-- "Platform Status" is intentionally NOT part of the score (built read-only in
-- the dashboard). Metric definitions, weights, targets, and bands are Super-Admin
-- configuration; tenants can view but never edit the formula.
-- ============================================================================

alter table platform_config
  add column if not exists health_window_days integer not null default 7 check (health_window_days > 0),
  add column if not exists health_baseline_min_age_days integer not null default 7,
  add column if not exists health_baseline_min_events integer not null default 1,
  add column if not exists health_benchmark_min_tenants integer not null default 5,
  add column if not exists health_formula_version integer not null default 1;

create type community_health_metric_status as enum ('active', 'retired');

-- Metric definitions (platform-level configuration). requires_feature marks a
-- metric that only applies when a tenant uses that feature (draft / support).
create table community_health_metrics (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  description text not null,
  enabled boolean not null default true,
  status community_health_metric_status not null default 'active',
  weight integer not null check (weight >= 0),
  max_score integer not null check (max_score > 0),
  measurement_window_days integer not null default 7 check (measurement_window_days > 0),
  scoring jsonb not null default '{}'::jsonb,      -- { "target": number }
  requires_feature text,                            -- null | 'competitor_draft' | 'creator_support'
  suggestion text,                                  -- deterministic coaching tip when weak
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_community_health_metrics_updated_at
  before update on community_health_metrics for each row execute function app.set_updated_at();

-- Configurable visual bands (never tied to Revenue Plans).
create table community_health_bands (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  min_score integer not null,
  max_score integer not null,
  tone text not null default 'positive',            -- positive | warning | negative | neutral
  display_order integer not null default 0
);

-- Immutable daily snapshots. Stores component scores + raw values + the applicable
-- config so a historical score stays explainable even if the formula later changes.
create table community_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  snapshot_date date not null,
  calculated_at timestamptz not null default now(),
  status text not null,                             -- 'scored' | 'building_baseline'
  overall_score integer,                            -- null while building baseline
  band_key text,
  formula_version integer not null,
  components jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, snapshot_date)
);
create index idx_health_snapshots_tenant on community_health_snapshots (tenant_id, snapshot_date desc);

alter table community_health_metrics enable row level security;
alter table community_health_bands enable row level security;
alter table community_health_snapshots enable row level security;

create policy chm_read on community_health_metrics for select using (true);
create policy chm_write on community_health_metrics for all using (app.is_super_admin()) with check (app.is_super_admin());
create policy chb_read on community_health_bands for select using (true);
create policy chb_write on community_health_bands for all using (app.is_super_admin()) with check (app.is_super_admin());
create policy chs_read on community_health_snapshots for select
  using (app.is_super_admin() or app.is_tenant_member(tenant_id));
create policy chs_write on community_health_snapshots for all using (app.is_super_admin()) with check (app.is_super_admin());

-- Bump the formula version whenever the scoring configuration changes, so future
-- config edits never silently reinterpret old snapshots.
create or replace function app.bump_health_formula_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update platform_config set health_formula_version = health_formula_version + 1;
  return null;
end; $$;
create trigger trg_chm_bump_version after insert or update or delete on community_health_metrics
  for each statement execute function app.bump_health_formula_version();
create trigger trg_chb_bump_version after insert or update or delete on community_health_bands
  for each statement execute function app.bump_health_formula_version();

-- ── Seed: 5 scored metrics + bands (example config; Super-Admin editable) ─────
insert into community_health_metrics (key, display_name, description, weight, max_score, measurement_window_days, scoring, requires_feature, suggestion, display_order)
values
  ('audience_growth', 'Audience Growth', 'How your Weekly Active Users are trending versus the previous week.', 20, 20, 7, '{"target":100}'::jsonb, null,
   'Invite followers and share your community to grow weekly active users.', 0),
  ('event_consistency', 'Event Consistency', 'How consistently you run events across recent weeks.', 15, 15, 28, '{"target":100}'::jsonb, null,
   'Publish events on a consistent schedule.', 1),
  ('prediction_participation', 'Prediction Participation', 'The share of weekly active users who make at least one prediction.', 20, 20, 7, '{"target":85}'::jsonb, null,
   'Promote prediction links before events begin.', 2),
  ('draft_participation', 'Draft Participation', 'The share of active users who take part in your Competitor Draft.', 15, 15, 7, '{"target":60}'::jsonb, 'competitor_draft',
   'Open Draft earlier and promote it before it closes.', 3),
  ('community_support', 'Community Support', 'The share of active users who voluntarily support you.', 20, 20, 7, '{"target":8}'::jsonb, 'creator_support',
   'Make sure Creator Support is enabled and visible to your community.', 4)
on conflict (key) do nothing;

insert into community_health_bands (key, label, min_score, max_score, tone, display_order)
values
  ('excellent', 'Excellent', 90, 100, 'positive', 0),
  ('healthy', 'Healthy', 75, 89, 'positive', 1),
  ('needs_attention', 'Needs Attention', 60, 74, 'warning', 2),
  ('at_risk', 'At Risk', 40, 59, 'warning', 3),
  ('critical', 'Critical', 0, 39, 'negative', 4)
on conflict (key) do nothing;

-- Seeding fired the version-bump triggers; reset to a clean baseline of 1.
update platform_config set health_formula_version = 1;

-- ── Deterministic calculation service ────────────────────────────────────────
-- Returns the full, explainable Community Health for a tenant as of a moment:
-- overall (0-100, normalized over enabled+applicable metrics), band, per-component
-- raw values + scores, and the formula version. Set-based; no hidden inputs.
create or replace function app.calculate_community_health(p_tenant uuid, p_as_of timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  cfg record; w int; from0 timestamptz; prev0 timestamptz;
  wau_cur int; wau_prev int;
  draft_applicable boolean; support_applicable boolean; draft_has_history boolean;
  events_total int; tenant_created timestamptz;
  m record; comps jsonb := '[]'::jsonb;
  num numeric := 0; den numeric := 0;
  raw numeric; value numeric; score int; applicable boolean; building boolean; extra jsonb;
  overall int; band_key text; v_status text; fv int;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin() or app.is_tenant_member(p_tenant)) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select wau_window_days, wau_min_actions, wau_signal_prediction, wau_signal_draft, wau_signal_login,
         health_window_days, health_baseline_min_age_days, health_baseline_min_events, health_formula_version
    into cfg from platform_config limit 1;
  w := coalesce(cfg.health_window_days, 7);
  fv := coalesce(cfg.health_formula_version, 1);
  from0 := p_as_of - make_interval(days => w);
  prev0 := p_as_of - make_interval(days => w * 2);

  wau_cur := app.tenant_wau(p_tenant, from0, p_as_of, coalesce(cfg.wau_min_actions,1), coalesce(cfg.wau_signal_prediction,true), coalesce(cfg.wau_signal_draft,true), coalesce(cfg.wau_signal_login,true));
  wau_prev := app.tenant_wau(p_tenant, prev0, from0, coalesce(cfg.wau_min_actions,1), coalesce(cfg.wau_signal_prediction,true), coalesce(cfg.wau_signal_draft,true), coalesce(cfg.wau_signal_login,true));

  select exists (select 1 from competition_draft_settings d where d.tenant_id = p_tenant and d.is_enabled) into draft_applicable;
  select exists (select 1 from tenant_feature_flags f where f.tenant_id = p_tenant and f.flag = 'creator_support_enabled' and f.enabled) into support_applicable;
  select exists (select 1 from competitor_draft_assignments a where a.tenant_id = p_tenant and a.confirmed_at is not null) into draft_has_history;
  select count(*) into events_total from events e where e.tenant_id = p_tenant and e.status <> 'draft';
  select created_at into tenant_created from tenants where id = p_tenant;

  for m in select * from community_health_metrics where enabled and status = 'active' order by display_order loop
    applicable := true; building := false; raw := 0; value := 0; extra := '{}'::jsonb;

    if m.key = 'audience_growth' then
      if wau_prev > 0 then value := 50 + ((wau_cur - wau_prev)::numeric / wau_prev) * 100;
      else value := case when wau_cur > 0 then 75 else 0 end; end if;
      value := least(100, greatest(0, value));
      raw := wau_cur;
      extra := jsonb_build_object('current_wau', wau_cur, 'previous_wau', wau_prev,
        'change_pct', case when wau_prev > 0 then round(((wau_cur - wau_prev)::numeric / wau_prev) * 100, 1) else null end);

    elsif m.key = 'event_consistency' then
      declare weeks int; active_weeks int; ew int := greatest(m.measurement_window_days, w);
      begin
        weeks := greatest(1, ceil(ew::numeric / 7));
        select count(distinct floor(extract(epoch from (p_as_of - e.created_at)) / 604800))
          into active_weeks from events e
          where e.tenant_id = p_tenant and e.status <> 'draft'
            and e.created_at >= p_as_of - make_interval(days => ew) and e.created_at < p_as_of;
        value := least(100, (active_weeks::numeric / weeks) * 100);
        raw := round(value, 0);
      end;

    elsif m.key = 'prediction_participation' then
      declare predictors int;
      begin
        select count(distinct user_id) into predictors from predictions
          where tenant_id = p_tenant and submitted_at >= from0 and submitted_at < p_as_of;
        value := case when wau_cur > 0 then least(100, (predictors::numeric / wau_cur) * 100) else 0 end;
        raw := round(value, 0);
        extra := jsonb_build_object('predictors', predictors, 'active_users', wau_cur);
      end;

    elsif m.key = 'draft_participation' then
      if not draft_applicable then applicable := false;
      elsif not draft_has_history then building := true;
      else
        declare drafters int;
        begin
          select count(distinct user_id) into drafters from competitor_draft_assignments
            where tenant_id = p_tenant and confirmed_at is not null and confirmed_at >= from0 and confirmed_at < p_as_of;
          value := case when wau_cur > 0 then least(100, (drafters::numeric / wau_cur) * 100) else 0 end;
          raw := round(value, 0);
          extra := jsonb_build_object('drafters', drafters, 'active_users', wau_cur);
        end;
      end if;

    elsif m.key = 'community_support' then
      if not support_applicable then applicable := false;
      else
        declare supporters int;
        begin
          -- creator_supporter only — Platform Support (platform_premium) is excluded.
          select count(distinct user_id) into supporters from billing_entitlements
            where tenant_id = p_tenant and entitlement_type = 'creator_supporter' and status = 'active';
          value := case when wau_cur > 0 then least(100, (supporters::numeric / wau_cur) * 100) else 0 end;
          raw := round(value, 1);
          extra := jsonb_build_object('supporters', supporters, 'active_users', wau_cur);
        end;
      end if;
    end if;

    if applicable and not building then
      score := greatest(0, least(m.max_score, round(m.max_score * value / greatest(1, coalesce((m.scoring->>'target')::numeric, 100)))));
      num := num + m.weight * (score::numeric / m.max_score);
      den := den + m.weight;
    else
      score := null;
    end if;

    comps := comps || jsonb_build_object(
      'key', m.key, 'display_name', m.display_name, 'applicable', applicable, 'building', building,
      'raw', raw, 'value', round(value, 1), 'score', score, 'max_score', m.max_score, 'weight', m.weight,
      'target', coalesce((m.scoring->>'target')::numeric, 100), 'suggestion', m.suggestion,
      'window_days', m.measurement_window_days, 'extra', extra);
  end loop;

  -- Building baseline: too new or no events yet → do not show a misleading number.
  if extract(epoch from (p_as_of - tenant_created)) < coalesce(cfg.health_baseline_min_age_days,7) * 86400
     or events_total < coalesce(cfg.health_baseline_min_events,1)
     or den = 0 then
    v_status := 'building_baseline'; overall := null; band_key := null;
  else
    v_status := 'scored';
    overall := round(100 * num / den);
    select key into band_key from community_health_bands where overall between min_score and max_score order by display_order limit 1;
  end if;

  return jsonb_build_object('tenant_id', p_tenant, 'status', v_status, 'overall_score', overall,
    'band', band_key, 'formula_version', fv, 'window_days', w, 'calculated_at', p_as_of, 'components', comps);
end; $$;

-- Public wrapper (member / admin / service).
create or replace function public.community_health_now(p_tenant uuid, p_as_of timestamptz default now())
returns jsonb language sql stable security definer set search_path = public as $$
  select app.calculate_community_health(p_tenant, p_as_of);
$$;
grant execute on function public.community_health_now(uuid, timestamptz) to authenticated, service_role;

-- Persist today's snapshot (idempotent per day).
create or replace function public.snapshot_community_health(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
declare h jsonb;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then raise exception 'NOT_AUTHORIZED'; end if;
  h := app.calculate_community_health(p_tenant, now());
  insert into community_health_snapshots (tenant_id, snapshot_date, status, overall_score, band_key, formula_version, components)
  values (p_tenant, current_date, h->>'status', (h->>'overall_score')::int, h->>'band', (h->>'formula_version')::int, h->'components')
  on conflict (tenant_id, snapshot_date) do update set
    status = excluded.status, overall_score = excluded.overall_score, band_key = excluded.band_key,
    formula_version = excluded.formula_version, components = excluded.components, calculated_at = now();
end; $$;
grant execute on function public.snapshot_community_health(uuid) to service_role;

create or replace function public.snapshot_all_community_health()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; n int := 0;
begin
  if not (auth.role() = 'service_role' or app.is_super_admin()) then raise exception 'NOT_AUTHORIZED'; end if;
  for t in select id from tenants where status = 'active' loop
    perform public.snapshot_community_health(t.id); n := n + 1;
  end loop;
  return n;
end; $$;
grant execute on function public.snapshot_all_community_health() to service_role;

-- ── Anonymous benchmarks ─────────────────────────────────────────────────────
-- Per-metric median + top-10% across tenants' latest snapshots. Only surfaces
-- when at least health_benchmark_min_tenants have data. Never exposes identities.
create or replace function public.community_health_benchmarks()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare min_t int; result jsonb := '{}'::jsonb; r record;
begin
  select coalesce(health_benchmark_min_tenants, 5) into min_t from platform_config limit 1;
  for r in
    with latest as (
      select distinct on (tenant_id) tenant_id, components
      from community_health_snapshots where status = 'scored'
      order by tenant_id, snapshot_date desc
    ), vals as (
      select c->>'key' as key, (c->>'value')::numeric as value
      from latest l, jsonb_array_elements(l.components) c
      where (c->>'applicable')::boolean and not (c->>'building')::boolean and c->>'score' is not null
    )
    select key, count(*) n,
      percentile_cont(0.5) within group (order by value) median,
      percentile_cont(0.9) within group (order by value) p90
    from vals group by key
  loop
    if r.n >= min_t then
      result := result || jsonb_build_object(r.key, jsonb_build_object('median', round(r.median,1), 'top10', round(r.p90,1), 'n', r.n));
    end if;
  end loop;
  return result;
end; $$;
grant execute on function public.community_health_benchmarks() to authenticated, service_role;
