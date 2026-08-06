-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7.6 §1–§2 — production job-drain safety.
--
-- The durable job queue (0035) already lets many workers claim DIFFERENT jobs
-- concurrently (FOR UPDATE SKIP LOCKED). This migration adds a DRAIN-LEVEL guard
-- so two *global* drains cannot both own the same work partition at once, plus a
-- lease TTL so a crashed worker never holds the partition forever. It is a durable
-- lease (a table row), not in-memory state, so it survives across serverless
-- invocations and pooled connections.
--
-- It also makes `fail_job` RETURN the resulting status so the worker can log
-- dead-letter transitions accurately (retry vs. terminal) without a second query.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Durable worker lease ──────────────────────────────────────────────────────
create table if not exists worker_leases (
  partition   text primary key,
  holder      text not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
-- Service-role only: RLS on with NO policies denies anon/authenticated entirely
-- (same posture as system_jobs / idempotency_records).
alter table worker_leases enable row level security;

-- Acquire a lease for a partition. Returns true only if this holder now owns it:
-- the partition was free, OR the previous lease had expired (crashed worker). A
-- live lease held by anyone (incl. a racing worker) yields false — no overlap.
create or replace function public.acquire_worker_lease(
  p_partition text, p_holder text, p_ttl_seconds int default 300
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  insert into worker_leases (partition, holder, acquired_at, expires_at)
  values (p_partition, p_holder, now(), now() + make_interval(secs => greatest(p_ttl_seconds, 1)))
  on conflict (partition) do update
    set holder = excluded.holder, acquired_at = now(), expires_at = excluded.expires_at
    where worker_leases.expires_at < now()      -- only ever STEAL an expired lease
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $$;

-- Release a lease, but only if this holder still owns it (a lease stolen after
-- TTL expiry belongs to someone else and must not be released out from under them).
create or replace function public.release_worker_lease(
  p_partition text, p_holder text
) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from worker_leases where partition = p_partition and holder = p_holder;
end; $$;

revoke all on function public.acquire_worker_lease(text, text, int) from public;
revoke all on function public.release_worker_lease(text, text) from public;
grant execute on function public.acquire_worker_lease(text, text, int) to service_role;
grant execute on function public.release_worker_lease(text, text) to service_role;

-- ── fail_job now reports its outcome ─────────────────────────────────────────
-- Returns 'dead' when the retry budget is spent (dead-letter, terminal, visible)
-- or 'pending' when it re-queued with backoff. Behaviour is otherwise identical
-- to 0035. Changing the return type requires a drop first.
drop function if exists public.fail_job(uuid, text);
create or replace function public.fail_job(p_id uuid, p_error text)
returns text language plpgsql security definer set search_path = public as $$
declare j system_jobs%rowtype; v_status text;
begin
  select * into j from system_jobs where id = p_id;
  if not found then return null; end if;
  if j.attempts >= j.max_attempts then
    update system_jobs set status = 'dead', error = p_error, finished_at = now() where id = p_id;
    v_status := 'dead';
  else
    update system_jobs set status = 'pending', error = p_error, finished_at = null,
      run_at = now() + make_interval(secs => least(power(2, j.attempts)::int, 3600))
    where id = p_id;
    v_status := 'pending';
  end if;
  return v_status;
end; $$;
revoke all on function public.fail_job(uuid, text) from public;
grant execute on function public.fail_job(uuid, text) to service_role;
