-- ============================================================================
-- 0060_growth_notifications — Phase 8-B.5 GRE.7: meaningful growth notifications.
--
-- Emitted by TRIGGERS on the state changes themselves, so the tested evaluate /
-- snapshot functions are untouched. Anti-spam is the notifications table's unique
-- (tenant_id, dedupe_key) — a given transition notifies once. Copy is
-- celebratory (upgrade), helpful (at risk), factual/non-punitive (downgrade),
-- positive (recovered), coaching (health). Community Health is never presented as
-- controlling the Revenue Plan.
-- ============================================================================

-- Notify a tenant's owner(s) (the creator owners). Reuses app.emit_notification.
create or replace function app.notify_tenant_owners(
  p_tenant uuid, p_type notification_type, p_title text, p_body text, p_dedupe text, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  for o in select distinct owner_user_id from creators where tenant_id = p_tenant loop
    perform app.emit_notification(p_tenant, o.owner_user_id, p_type, p_title, p_body, 'growth', null, p_dedupe || ':' || o.owner_user_id, p_metadata);
  end loop;
end; $$;

-- Plan assignment → upgrade / downgrade notifications (manual/initial are silent).
create or replace function app.notify_plan_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan record;
begin
  select key, display_name into v_plan from revenue_plans where id = new.plan_id;
  if new.assignment_type = 'automatic_upgrade' then
    perform app.notify_tenant_owners(new.tenant_id, 'plan_upgraded',
      'Congratulations — you''ve reached ' || v_plan.display_name || '!',
      'Your community qualified for the ' || v_plan.display_name || ' plan. Your revenue shares have improved.',
      'plan_upgraded:' || new.plan_id, jsonb_build_object('plan', v_plan.key));
  elsif new.assignment_type = 'automatic_downgrade' then
    perform app.notify_tenant_owners(new.tenant_id, 'plan_downgraded',
      'Your plan changed to ' || v_plan.display_name,
      'Activity fell below the requirement during the grace period, so your plan is now ' || v_plan.display_name || '. Grow your weekly active users to qualify again.',
      'plan_downgraded:' || new.id, jsonb_build_object('plan', v_plan.key));
  end if;
  return null;
end; $$;
create trigger trg_notify_plan_assignment after insert on tenant_revenue_plan_assignments
  for each row execute function app.notify_plan_assignment();

-- Plan state → At Risk / recovered + WAU milestone notifications.
create or replace function app.notify_plan_state_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare threshold int;
begin
  if tg_op = 'UPDATE' and old.status = 'qualified' and new.status = 'at_risk' then
    perform app.notify_tenant_owners(new.tenant_id, 'plan_at_risk',
      'Your community is at risk of a plan change',
      'Weekly active users dipped below your plan''s requirement. If activity recovers before the grace period ends, nothing changes.',
      'plan_at_risk:' || coalesce(new.at_risk_since::text, now()::text), '{}'::jsonb);
  elsif tg_op = 'UPDATE' and old.status = 'at_risk' and new.status = 'qualified' then
    perform app.notify_tenant_owners(new.tenant_id, 'plan_recovered',
      'You''re back on track',
      'Your community recovered before the grace period ended — your plan is unchanged. Nice work!',
      'plan_recovered:' || coalesce(old.at_risk_since::text, now()::text), '{}'::jsonb);
  end if;

  -- WAU milestone crossings (notify once per threshold).
  if new.current_wau is not null and coalesce(old.current_wau, 0) < new.current_wau then
    foreach threshold in array array[100, 500, 1000, 5000, 10000] loop
      if coalesce(old.current_wau, 0) < threshold and new.current_wau >= threshold then
        perform app.notify_tenant_owners(new.tenant_id, 'wau_milestone',
          'You reached ' || threshold || ' weekly active users!',
          'Your community keeps growing. Keep the momentum going.',
          'wau_milestone:' || threshold, jsonb_build_object('threshold', threshold));
      end if;
    end loop;
  end if;
  return null;
end; $$;
create trigger trg_notify_plan_state after insert or update on tenant_plan_state
  for each row execute function app.notify_plan_state_change();

-- Community Health band change → coaching notifications (improve up / drop into
-- Needs Attention or lower). Compares to the previous scored snapshot.
create or replace function app.notify_health_band()
returns trigger language plpgsql security definer set search_path = public as $$
declare prev_band text; new_rank int; prev_rank int; new_label text;
begin
  if new.status <> 'scored' or new.band_key is null then return null; end if;
  select band_key into prev_band from community_health_snapshots
   where tenant_id = new.tenant_id and status = 'scored' and snapshot_date < new.snapshot_date
   order by snapshot_date desc limit 1;
  if prev_band is null or prev_band = new.band_key then return null; end if;

  select display_order, label into new_rank, new_label from community_health_bands where key = new.band_key;
  select display_order into prev_rank from community_health_bands where key = prev_band;
  -- Lower display_order = healthier band.
  if new_rank < prev_rank then
    perform app.notify_tenant_owners(new.tenant_id, 'health_band_improved',
      'Community Health improved to ' || new_label,
      'Your community is trending in the right direction. Keep it up!',
      'health_up:' || new.band_key, jsonb_build_object('band', new.band_key));
  elsif new.band_key in ('needs_attention', 'at_risk', 'critical') then
    perform app.notify_tenant_owners(new.tenant_id, 'health_needs_attention',
      'Community Health needs attention',
      'A few areas of your community could use a boost. Open your Growth dashboard for specific, deterministic suggestions.',
      'health_down:' || new.band_key, jsonb_build_object('band', new.band_key));
  end if;
  return null;
end; $$;
create trigger trg_notify_health_band after insert or update on community_health_snapshots
  for each row execute function app.notify_health_band();
