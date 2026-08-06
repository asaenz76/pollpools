# Background jobs & the async projection pipeline

Settlement writes are synchronous and authoritative; everything *derived* from
them — user statistics, scoped leaderboards, draft standings, achievements,
notifications and feeds — is produced asynchronously by durable background jobs.
This document is the reference for how that job system works: enqueue, claim,
execute, retry, dead-letter, and how projections stay correct despite all of it.

## The transactional outbox

`settle_event` / `regrade_event` commit the immutable grades **and** enqueue the
projection jobs in the *same* transaction (`enqueue_settlement_projections`).
There is no window where grades exist but their follow-up work was lost, and no
window where a job references a settlement that rolled back. Grades are the
source of truth; jobs only ever *rebuild caches from grades*.

## `system_jobs`

One table backs every async unit of work.

| Column | Meaning |
| --- | --- |
| `job_type` | e.g. `projection.user_stats`, `projection.leaderboard`, `projection.draft_standings`, `projection.achievements`, `projection.event_publish_feed`, `projection.event_publish_fanout` |
| `payload` | jsonb — `settlement_id`, `user_id`, scope descriptors, cursor state |
| `status` | `pending → running → succeeded` / `failed` (retryable) / `dead` (exhausted) / `canceled` |
| `dedup_key` | idempotency: a duplicate enqueue is a no-op |
| `attempts` / `max_attempts` | retry budget |
| `run_at` | earliest execution time (deferral / backoff) |
| `seq` | monotonic `bigserial` — FIFO ordering within a claim batch |
| `tenant_id` | every job is tenant-scoped |

Claiming is `claim_jobs(p_limit, p_tenant)`: it atomically flips a batch of due
`pending` rows to `running`, ordered by `seq`, skipping locked rows so multiple
workers never collide. The partial index `idx_system_jobs_claim
(tenant_id, run_at, seq) where status='pending'` keeps claims cheap.

## The worker

`src/lib/jobs/worker.ts` — `runPendingJobs` / `drainJobs(admin, tenantId)` claim
and run jobs. Each handler returns one of:

- **`void`** — success; the job is marked `succeeded`.
- **`{ skipped }`** — nothing to do (already applied / superseded); succeeded.
- **`{ defer }`** — a prerequisite is not ready; re-queue *without* consuming a
  retry (`defer_job` decrements `attempts`), so deferral is free and unbounded.

A thrown handler → `failed` with backoff until `attempts` hits `max_attempts`,
then `dead` (dead-letter). Dead is not silent data loss — see reconciliation.

## Version-aware, prerequisite-gated projections

Projections must converge even when jobs run late, twice, or out of order.

1. **Recompute-from-active-set.** Every projection function rebuilds its slice
   from `settlements` where `status='active'` — never `±1` from the job's own
   delta. A stale or duplicated job therefore cannot drift the cache: it just
   recomputes the same canonical value.
2. **Version check.** Each job carries the `settlement_id` it was enqueued for.
   If that settlement is no longer active (a regrade superseded it), the job is
   `stale` and skips. The active version always wins.
3. **Explicit prerequisites.** Leaderboards and achievements depend on user
   stats. `app.user_stats_prereqs(settlement[,user])` returns
   `ready` / `pending` / `blocked`. A dependent job **defers** while its stats
   job is still pending and **blocks** (fails toward dead-letter) if the stats
   job dead-lettered. This is an explicit dependency, *not* a FIFO/timing
   assumption — reordering the queue cannot produce a half-applied projection.

Job types and constants live in `src/lib/jobs/types.ts`
(`JOB_TYPES`, `NOTIFICATION_FANOUT_BATCH_SIZE = 100`).

## Notification fan-out

Publishing an event does **not** loop over followers synchronously. It enqueues
a feed job and a fan-out job. `notification_fanouts` holds resumable cursor
state; `process_event_publish_fanout(fanout_id, batch)` advances one batch at a
time, is idempotent per recipient, and evaluates eligibility (follow + prefs) at
batch time. An interrupted fan-out resumes from its durable cursor with no
duplicate recipients. See [social.md](social.md).

## Determinism guarantees

- **Streak ordering** is `coalesce(e.starts_at, s.activated_at) asc nulls last,
  e.id asc` — regrade-invariant, so streaks never depend on settlement timing.
- **Draft finishing positions** recorded once carry forward across a winner-only
  regrade (`event_competitor_results.recorded`); the winner-only fallback is
  gated by `winner_only_fallback` config.
- **Canonical rebuilds** (`rebuild_user_statistics`, `rebuild_leaderboard_scope`,
  `rebuild_draft_competition`, `rebuild_user_achievements`, …) are the single
  definition of "correct". Async projections must equal them — the
  regrade-convergence and reconciliation suites assert exactly this.

See also: [settlement.md](settlement.md), [reconciliation.md](reconciliation.md),
[operations.md](operations.md).
