-- ============================================================================
-- 0035 — Phase 7.5 §5 (A): durable job lifecycle + worker contract.
--
-- Derived projections (statistics, leaderboards, achievements, streaks, draft
-- standings, feed, notifications) move OFF the synchronous settlement transaction
-- onto durable `system_jobs`. This slice adds the job lifecycle only: enqueue
-- (idempotent), claim (concurrent-safe), complete, fail (retry w/ backoff →
-- dead-letter), and skip (supersede stale work). Enqueue-from-settlement and the
-- projection handlers land in later sub-slices.
--
-- The worker calls claim/complete/fail/skip from the app server via PostgREST, so
-- these are public functions granted to service_role ONLY (like apply_billing_event).
-- ============================================================================

-- Terminal dead-letter state + retry budget + idempotent-enqueue key.
alter table system_jobs drop constraint if exists system_jobs_status_check;
alter table system_jobs add constraint system_jobs_status_check
  check (status in ('pending', 'running', 'succeeded', 'failed', 'canceled', 'dead'));
alter table system_jobs add column if not exists max_attempts integer not null default 5;
alter table system_jobs add column if not exists dedup_key text;

-- One live job per dedup_key: prevents enqueuing the same unit of work twice.
create unique index if not exists uq_system_jobs_dedup on system_jobs (dedup_key) where dedup_key is not null;
-- Claiming scans pending, due jobs oldest-first.
create index if not exists idx_system_jobs_due on system_jobs (run_at) where status = 'pending';

-- Enqueue a job. Idempotent: a dedup_key already present (any status) is a no-op,
-- so re-enqueuing the same unit of work never duplicates it. Version-scoped keys
-- (e.g. include grading_version) let a new version enqueue its own fresh job.
create or replace function public.enqueue_job(
  p_tenant uuid, p_job_type text, p_payload jsonb,
  p_dedup_key text default null, p_max_attempts int default 5, p_run_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into system_jobs (tenant_id, job_type, payload, dedup_key, max_attempts, run_at, status)
  values (p_tenant, p_job_type, coalesce(p_payload, '{}'::jsonb), p_dedup_key, p_max_attempts, p_run_at, 'pending')
  on conflict (dedup_key) where dedup_key is not null do nothing
  returning id into v_id;
  return v_id;  -- null when deduplicated
end; $$;

-- Claim up to N due jobs atomically (FOR UPDATE SKIP LOCKED → safe for many
-- concurrent workers). Marks them running and counts the attempt.
create or replace function public.claim_jobs(p_limit int default 10)
returns setof system_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update system_jobs j set status = 'running', started_at = now(), attempts = attempts + 1
  where j.id in (
    select c.id from system_jobs c
    where c.status = 'pending' and c.run_at <= now()
    order by c.run_at
    for update skip locked
    limit greatest(p_limit, 1)
  )
  returning j.*;
end; $$;

create or replace function public.complete_job(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update system_jobs set status = 'succeeded', finished_at = now(), error = null where id = p_id;
$$;

-- Fail with retry + exponential backoff; dead-letter once the retry budget is spent.
create or replace function public.fail_job(p_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare j system_jobs%rowtype;
begin
  select * into j from system_jobs where id = p_id;
  if not found then return; end if;
  if j.attempts >= j.max_attempts then
    update system_jobs set status = 'dead', error = p_error, finished_at = now() where id = p_id;
  else
    update system_jobs set status = 'pending', error = p_error, finished_at = null,
      run_at = now() + make_interval(secs => least(power(2, j.attempts)::int, 3600))
    where id = p_id;
  end if;
end; $$;

-- Skip a job that is no longer relevant (e.g. superseded by a newer grading
-- version). Terminal + visible, never retried.
create or replace function public.skip_job(p_id uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  update system_jobs set status = 'canceled', error = p_reason, finished_at = now() where id = p_id;
$$;

-- Service-role only (workers run under the admin client).
revoke all on function public.enqueue_job(uuid, text, jsonb, text, int, timestamptz) from public;
revoke all on function public.claim_jobs(int) from public;
revoke all on function public.complete_job(uuid) from public;
revoke all on function public.fail_job(uuid, text) from public;
revoke all on function public.skip_job(uuid, text) from public;
grant execute on function public.enqueue_job(uuid, text, jsonb, text, int, timestamptz) to service_role;
grant execute on function public.claim_jobs(int) to service_role;
grant execute on function public.complete_job(uuid) to service_role;
grant execute on function public.fail_job(uuid, text) to service_role;
grant execute on function public.skip_job(uuid, text) to service_role;
