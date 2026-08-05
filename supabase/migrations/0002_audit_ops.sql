-- ============================================================================
-- 0002_audit_ops.sql
-- Operational + security backbone: audit logging, idempotency ledger,
-- background job queue, and the moderation report inbox.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- audit_logs — append-only record of privileged/sensitive actions.
-- ----------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete set null,
  actor_user_id uuid references users (id) on delete set null,
  action text not null,                 -- e.g. 'tenant.suspend', 'settlement.regrade'
  entity_type text not null,            -- e.g. 'tenant', 'creator', 'settlement'
  entity_id uuid,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index idx_audit_tenant_time on audit_logs (tenant_id, created_at desc);
create index idx_audit_entity on audit_logs (entity_type, entity_id);
create index idx_audit_actor on audit_logs (actor_user_id, created_at desc);

-- Reusable audit writer. SECURITY DEFINER so domain functions can log without
-- the caller needing direct insert rights on audit_logs.
create or replace function app.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid default null,
  p_actor_user_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into audit_logs
    (tenant_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
  values
    (p_tenant_id, p_actor_user_id, p_action, p_entity_type, p_entity_id, p_summary, p_metadata)
  returning id into v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- idempotency_records — dedupe key ledger for predictions, settlements, and
-- subscription webhooks. No client access at all (service-role/server only).
-- ----------------------------------------------------------------------------
create table idempotency_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  scope text not null,                  -- 'prediction' | 'settlement' | 'subscription_webhook' | ...
  idempotency_key text not null,
  request_hash text,
  response jsonb,
  status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (scope, idempotency_key)
);
create index idx_idempotency_tenant on idempotency_records (tenant_id, scope);

-- ----------------------------------------------------------------------------
-- system_jobs — durable background work (statistics rebuild, leaderboard
-- refresh, notification fan-out). Processed by a trusted server worker.
-- ----------------------------------------------------------------------------
create table system_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants (id) on delete cascade,
  job_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'canceled')),
  payload jsonb not null default '{}'::jsonb,
  error text,
  attempts integer not null default 0,
  run_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_system_jobs_queue on system_jobs (status, run_at);
create index idx_system_jobs_tenant on system_jobs (tenant_id, job_type);

create trigger trg_system_jobs_updated_at
  before update on system_jobs
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- moderation_reports — user/creator/content reports for the moderation queue.
-- ----------------------------------------------------------------------------
create table moderation_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  reporter_user_id uuid references users (id) on delete set null,
  subject_type text not null,           -- 'comment' | 'profile' | 'creator' | 'event' | ...
  subject_id uuid,
  reason text not null,
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by uuid references users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_moderation_tenant_status on moderation_reports (tenant_id, status);

create trigger trg_moderation_reports_updated_at
  before update on moderation_reports
  for each row execute function app.set_updated_at();
