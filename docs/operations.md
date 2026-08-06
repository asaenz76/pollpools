# Operations runbook — settlement projections

## Production scheduling (Phase 7.6)

Async settlement only works if something drains the queue. Two internal endpoints
do this, authenticated by `CRON_SECRET` (server-only; Vercel Cron sends it as
`Authorization: Bearer <CRON_SECRET>`; `x-cron-secret` also accepted). Both refuse
to run (503) until `CRON_SECRET` is set — they are never open.

| Endpoint | Does | Suggested cadence |
| --- | --- | --- |
| `POST/GET /api/internal/jobs/drain` | Claims + runs due jobs under a durable worker lease (no overlapping global drains; a crashed worker's lease auto-expires). Bounded batches; respects retry/dead-letter rules; structured JSON result. | every 1 min |
| `POST/GET /api/internal/projections/monitor` | Per-tenant projection-health check; requeues actionable (stuck / current dead-letter / retrying) jobs. Never runs a full rebuild. | every 5 min |

`vercel.json` wires both as Vercel Cron; the endpoints are portable to any
scheduler (GitHub Actions, cron-job.org, pg_cron) that can send the bearer secret.
An optional `{ "tenantId": "…" }` POST body scopes a run to one tenant. Results
report `claimed/succeeded/skipped/deferred/failed/deadLettered/durationMs`; a lease
already held returns `{ acquired: false }` (not an error); failures return 500 and
are logged, never swallowed.

## CI: integration tests cannot silently skip

Integration suites gate on a live Supabase (`integrationEnvReady`) and would
otherwise `describe.skip` when the DB env is absent — green with zero coverage.
`tests/integration/_env-guard.test.ts` prevents that: with no DB env it **fails**
unless `ALLOW_INTEGRATION_TEST_SKIP=true` (a local-dev opt-out, default false). CI
leaves it unset, so a run that skipped every integration suite is never green.

---

# Operations — reconciliation & repair

How to observe and repair the async projection pipeline in production. All
operations are tenant-scoped and super-admin / service-role only. Background on
the mechanics: [jobs.md](jobs.md); on repair internals: [reconciliation.md](reconciliation.md).

## Health at a glance

`getProjectionHealth(admin, tenantId)` → one of:

| State | Meaning | Action |
| --- | --- | --- |
| `healthy` | caches keeping up | none |
| `delayed` | oldest pending job older than the warn threshold | watch; usually self-clears |
| `degraded` | current-version jobs are retrying | monitor requeues them; investigate the error if it persists |
| `blocked` | a **current-version** prerequisite job dead-lettered | requeue + reconcile the affected scope |
| `critical` | multiple current dead-letters / sustained backlog | requeue, reconcile, and dig into `recent_failures` |

A dead-letter for a **superseded** settlement never raises the level — it is
stale history, not an incident.

## The scheduled monitor

`runProjectionMonitor(admin, tenantId)` is the lightweight periodic check. It
reads health and, on `degraded` / `blocked` / any stuck jobs, calls
`requeueActionableJobs`. It **never** runs a full tenant rebuild — that is always
a deliberate, manually-triggered operation. Wire it to your scheduler per tenant.

## Triage playbook

1. **Check health.** `getProjectionHealth`. `healthy` → done.
2. **Look at the numbers.** `getProjectionJobStats(admin, tenantId)` — `dead`,
   `stuck`, `retrying`, `oldest_pending_seconds`, `by_type`, `recent_failures`.
3. **Requeue actionable failures.** `requeueActionableJobs(admin, tenantId)` (or
   `reconcile` with mode `requeue`). Revives current dead-letters and stuck jobs
   with fresh `repair:{id}` jobs; originals are preserved; idempotent. Superseded
   / historical jobs are intentionally skipped.
4. **Detect drift before repairing.** `reconcile({ scope, scopeId, mode:
   'dry_run', idempotencyKey })`. Reports `differences_found` and a per-key
   before/after diff, writing nothing.
5. **Repair.** Same call with `mode: 'repair'`. Rebuilds the scope from
   authoritative grades to its canonical value; `repairs_applied` reports the
   change. Re-running dry-run should then report zero differences.

Narrow the scope as much as you can — `user` / `competition` / `creator` /
`event` — before falling back to a full `tenant` reconcile.

## Recipes

Detect drift for one user without changing anything:

```
reconcile(admin, { tenantId, scope: "user", scopeId: userId, mode: "dry_run", idempotencyKey: key })
```

Repair a competition's leaderboard and draft standings:

```
reconcile(admin, { tenantId, scope: "competition", scopeId: competitionId, mode: "repair", idempotencyKey: key })
```

Revive stuck / dead-lettered jobs across a tenant:

```
requeueActionableJobs(admin, tenantId)   // or reconcile(..., mode: "requeue")
```

## Guarantees to rely on

- Reconciliation touches **only** derived caches; grades, settlements,
  predictions and audit history are never modified.
- `dry_run` has zero side effects (savepoint rollback).
- Every run is idempotent by `idempotency_key` and recorded in
  `reconciliation_runs` + the audit log.
- Repair converges: a repaired scope equals the incremental pipeline's output
  and a subsequent dry-run reports zero differences.

See also: [jobs.md](jobs.md), [reconciliation.md](reconciliation.md),
[settlement.md](settlement.md).
