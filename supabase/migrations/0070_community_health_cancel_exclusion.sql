-- ============================================================================
-- 0070_community_health_cancel_exclusion — Creator Event Lifecycle (EVT §18).
--
-- Community Health COACHES growth and must never punish a legitimate cancellation.
-- Every other derived system (leaderboards, streaks, achievements, competitor
-- draft) already excludes canceled events automatically because they read
-- active-settlement grades — a canceled event contributes only void/0-point
-- grades (or none at all). Community Health is the one place that reads the
-- events/predictions tables DIRECTLY, so it needs explicit exclusion.
--
-- This recreates app.calculate_community_health identically to 0056 except for
-- three exclusions of canceled/voided events. It does NOT change the formula
-- version (only metric/band edits bump that, via their triggers), so stored
-- historical snapshots stay immutable and comparable.
--
--   1. Baseline gate (events_total): a canceled event is no longer a "real" event.
--   2. Event Consistency: a week whose only event was canceled is not an active week.
--   3. Prediction Participation: predictions on a canceled/voided event don't count.
--
-- WAU is independent (measured from activity signals, not event status) and is
-- deliberately untouched. Revenue Plan qualification does not use event metrics
-- and is untouched.
-- ============================================================================

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
  -- (1) Baseline gate excludes canceled/voided events.
  select count(*) into events_total from events e where e.tenant_id = p_tenant and e.status not in ('draft', 'canceled', 'voided');
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
        -- (2) A week whose only event was canceled/voided is not an active week.
        select count(distinct floor(extract(epoch from (p_as_of - e.created_at)) / 604800))
          into active_weeks from events e
          where e.tenant_id = p_tenant and e.status not in ('draft', 'canceled', 'voided')
            and e.created_at >= p_as_of - make_interval(days => ew) and e.created_at < p_as_of;
        value := least(100, (active_weeks::numeric / weeks) * 100);
        raw := round(value, 0);
      end;

    elsif m.key = 'prediction_participation' then
      declare predictors int;
      begin
        -- (3) Predictions on canceled/voided events don't count as participation.
        select count(distinct p.user_id) into predictors
          from predictions p
          join markets mk on mk.id = p.market_id
          join events e on e.id = mk.event_id
          where p.tenant_id = p_tenant and p.submitted_at >= from0 and p.submitted_at < p_as_of
            and e.status not in ('canceled', 'voided');
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
