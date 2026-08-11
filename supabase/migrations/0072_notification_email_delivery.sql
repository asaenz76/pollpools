-- ============================================================================
-- 0072_notification_email_delivery — Production email wiring (PL.3).
--
-- Wires the existing EmailNotificationProvider into the DURABLE notification path
-- WITHOUT a second queue: an insert into `notifications` enqueues a
-- `notification.email` job on the existing `system_jobs` outbox. The worker
-- (0035 retries + dead-letter) delivers via the provider and records per-channel
-- delivery state in `notification_deliveries` (idempotent by `(notification_id,
-- channel)` — a retry never re-sends a message already marked sent).
--
-- Safe defaults: email delivery is OFF platform-wide until enabled, per-user
-- `email_enabled` is opt-in (default false, from 0042), and an unconfigured
-- transport skips (never a fake send). Email failure runs in its own job/txn and
-- can never affect settlement.
-- ============================================================================

alter table platform_config
  add column if not exists email_delivery_enabled boolean not null default false;

-- Per-channel delivery state (the "delivery state" in the required architecture).
create table notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  notification_id uuid not null references notifications (id) on delete cascade,
  channel         text not null default 'email',
  status          text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  provider        text,
  error           text,
  attempts        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (notification_id, channel)
);
create index idx_notification_deliveries_status on notification_deliveries (tenant_id, status);

alter table notification_deliveries enable row level security;
-- Super-admin observability only; the worker writes via the service role (bypasses RLS).
create policy notification_deliveries_read on notification_deliveries for select using (app.is_super_admin());
create policy notification_deliveries_write on notification_deliveries for all using (app.is_super_admin()) with check (app.is_super_admin());

-- Which notification types are eligible for email (curated; meaningful + not noisy).
-- Extend deliberately — result/plan/billing/coaching milestones, not per-tick churn.
create or replace function app.email_eligible_type(p_type notification_type)
returns boolean language sql immutable as $$
  select p_type = any (array[
    'event_canceled', 'event_result_published', 'prediction_correct', 'prediction_incorrect',
    'prediction_updated', 'achievement_earned', 'creator_support_started', 'subscription_failed',
    'plan_upgraded', 'plan_at_risk', 'plan_recovered', 'plan_downgraded', 'health_needs_attention',
    'bracket_advancement', 'competition_starting'
  ]::notification_type[]);
$$;

-- Transactional outbox: enqueue an email delivery job when the platform switch is on,
-- the type is eligible, and the recipient opted into email. The worker re-checks and
-- resolves address/transport; a missing config skips safely.
create or replace function app.on_notification_email_enqueue()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_enabled boolean;
begin
  select email_delivery_enabled into v_enabled from platform_config limit 1;
  if coalesce(v_enabled, false)
     and app.email_eligible_type(new.type)
     and exists (
       select 1 from user_notification_preferences p
       where p.tenant_id = new.tenant_id and p.user_id = new.user_id and p.email_enabled
     ) then
    perform public.enqueue_job(new.tenant_id, 'notification.email',
      jsonb_build_object('notification_id', new.id, 'tenant_id', new.tenant_id),
      'email:' || new.id::text);
  end if;
  return new;
end; $$;

create trigger trg_notification_email after insert on notifications
  for each row execute function app.on_notification_email_enqueue();

grant execute on function app.email_eligible_type(notification_type) to authenticated, service_role;
