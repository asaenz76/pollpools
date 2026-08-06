# Reconciliation & repair

Async projections (see [jobs.md](jobs.md)) are eventually consistent caches of
authoritative grades. Reconciliation is the safety net that **proves** a cache
matches its canonical rebuild and repairs it if not — without ever touching the
immutable grade/settlement history. It is the operational close-out of the async
settlement pipeline (findings F-02, F-05).

Everything here is **super-admin / service-role only** and **tenant-scoped**.

## What reconciliation is (and is not)

- It **reads authoritative grades** and re-derives projections using the *same*
  deterministic rebuild functions the pipeline itself uses
  (`rebuild_user_statistics`, `rebuild_leaderboard_scope`,
  `rebuild_draft_competition`, `rebuild_user_achievements`). No logic is
  duplicated — reconciliation is a thin orchestrator over the rebuilds.
- It **never** mutates grades, settlements, predictions, or any audit/history.
  It only rewrites derived caches, and only to their canonical value.

## The orchestrator: `reconcile(...)`

`public.reconcile(p_tenant, p_scope_type, p_scope_id, p_mode, p_idempotency_key)`

**Scopes** (`reconciliation_scope_type`): `user`, `event`, `settlement`,
`competition`, `creator`, `season`, `tenant`. A scope selects which slice to
rebuild; `tenant` reconciles everything.

**Modes** (`reconciliation_mode`):

| Mode | Effect |
| --- | --- |
| `dry_run` | Rebuild into a savepoint, diff against current cache, **roll back all writes**, report the diff. Detects drift, changes nothing. |
| `repair` | Rebuild and **keep** the writes; report what changed. |
| `requeue` | Revive actionable failed/stuck jobs (delegates to `requeue_actionable_jobs`); record the run. |

### Dry-run via savepoint rollback

The rebuild runs inside a `begin … exception` block. After computing the diff a
dry-run deliberately `raise`s `RECON_DRYRUN_ROLLBACK`, which unwinds every write
made in the block while plpgsql locals (`v_before`, `v_after`, `v_diff`) survive
the rollback. The result: an exact "what would change" report with zero side
effects. Any *other* exception marks the run `failed` and re-raises.

### Idempotency & concurrency

Every run needs an `idempotency_key`. The key has a unique constraint and the
insert is `on conflict (idempotency_key) do nothing returning *`; the loser of a
race re-reads the winning row and returns it. Two identical concurrent requests
therefore produce **exactly one** `reconciliation_runs` row and both callers get
the same `run_id`.

### Audit

Every run is recorded in `reconciliation_runs` (scope, mode, status,
`differences_found`, `repairs_applied`, `jobs_requeued`, timing, initiator,
summary jsonb) and writes an audit entry (`reconcile.dry_run` /
`reconcile.repair` / `reconcile.requeue` / `reconcile.failed`). `reconciliation_runs`
has RLS: super-admins read; only the service role / definer writes.

### Cross-tenant guard

A scoped rebuild whose `scope_id` does not belong to `p_tenant` raises
`CROSS_TENANT_SCOPE`. Ordinary users are rejected with `NOT_AUTHORIZED`.

## State comparison internals

- `app.projection_state(tenant, scope_type, scope_id)` → normalized jsonb of the
  current cache for a scope, with volatile fields (timestamps, ids) excluded so
  the diff is stable.
- `app.rebuild_scope(tenant, scope_type, scope_id)` dispatches to the internal
  deterministic rebuilds — no auth, no duplication.
- `app.projection_diff(before, after)` → jsonb keyed by what changed, each entry
  `{ before, after }`. `differences_found` is the key count.

## Job classification & requeue

`app.classify_projection_job(job_id, stuck_minutes)` labels a job so repair is
precise about what is *actionable now* versus historical noise:

| Class | Meaning | Requeued? |
| --- | --- | --- |
| `current_and_actionable` | pending/running/failed for the active version | yes |
| `dead_letter_current` | dead, but its settlement is still active | yes |
| `stuck` | running past `stuck_minutes` | yes |
| `stale_version` / `superseded` | belongs to a superseded settlement | no |
| `dead_letter_historical` | dead for a superseded settlement | no |
| `missing_prerequisite` | blocked pending a prereq | no (prereq drives it) |
| `malformed_payload` | unparseable | no (needs a human) |

`public.requeue_actionable_jobs(tenant, stuck_minutes)` enqueues a fresh
`repair:{job_id}` job for each actionable one. The **original job row is
preserved** (audit), the new job has a distinct dedup key, and requeue is
idempotent (a second call creates no duplicate repair job). A superseded or
historical dead-letter is deliberately left alone — the active version already
has its own healthy jobs.

## Operational visibility

- `public.projection_job_stats(tenant, stuck_minutes)` → counts by status,
  oldest-pending age, by-type breakdown, recent failures.
- `public.projection_health(tenant, stuck_minutes, delay_warn_seconds)` →
  `healthy` / `delayed` / `degraded` / `blocked` / `critical`, driven by
  **current-version** dead-letters, stuck jobs, current retrying jobs and
  pending age. A dead-letter for a *superseded* version does **not** raise the
  alert level — stale history is not an incident.

## TypeScript service layer

`src/lib/ops/reconciliation.ts` wraps the SQL with typed helpers for trusted
server code: `reconcile`, `requeueActionableJobs`, `getProjectionJobStats`,
`getProjectionHealth`, and `runProjectionMonitor` (a lightweight scheduled check
that requeues on `degraded` / `blocked` / stuck but never runs a full tenant
rebuild — that stays a deliberate, manually-triggered operation).

See also: [jobs.md](jobs.md), [operations.md](operations.md),
[settlement.md](settlement.md).
