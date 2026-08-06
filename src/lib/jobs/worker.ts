import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// NOTE: no `import "server-only"` — this module holds no secrets (the admin client
// is passed in) and is imported by node integration tests. It is only ever invoked
// from trusted server code (the jobs route / reconciliation), which is the guard.

/**
 * Durable projection worker (§5).
 *
 * The synchronous settlement transaction is authoritative; it commits immutable
 * grades and enqueues small, idempotent `system_jobs`. This worker claims due
 * jobs (concurrent-safe), dispatches each to its registered handler, and marks
 * the outcome. A background-job failure NEVER affects the committed settlement.
 *
 * A handler returns `{ skipped }` to supersede stale work (e.g. a job for an old
 * grading version) — the worker cancels it (terminal, visible) instead of
 * completing it. Any thrown error retries with backoff and eventually dead-letters.
 */
export type SystemJob = Database["public"]["Tables"]["system_jobs"]["Row"];
type Admin = SupabaseClient<Database>;

export type JobContext = { admin: Admin };
/**
 * A handler returns:
 *  - void          → completed (default)
 *  - { skipped }   → superseded stale work; terminal, visible (canceled)
 *  - { defer }     → prerequisites unmet; re-scheduled without consuming the retry
 *                    budget. NOT a failure. A thrown error, by contrast, retries
 *                    with backoff and eventually dead-letters.
 */
export type JobOutcome = void | { skipped: string } | { defer: string };
export type JobHandler = (job: SystemJob, ctx: JobContext) => Promise<JobOutcome>;

const HANDLERS = new Map<string, JobHandler>();

export function registerJobHandler(jobType: string, handler: JobHandler): void {
  HANDLERS.set(jobType, handler);
}
export function registeredJobTypes(): string[] {
  return [...HANDLERS.keys()];
}

export type WorkerResult = { claimed: number; succeeded: number; skipped: number; deferred: number; failed: number };

/**
 * Claim and process one batch of due jobs. `tenantId` scopes claiming to a single
 * tenant (per-tenant workers / isolated tests); omit to drain all tenants.
 */
export async function runPendingJobs(admin: Admin, limit = 20, tenantId: string | null = null): Promise<WorkerResult> {
  const { data, error } = await admin.rpc("claim_jobs", { p_limit: limit, p_tenant: tenantId } as never);
  if (error) throw new Error(`claim_jobs failed: ${error.message}`);
  const jobs = (data ?? []) as SystemJob[];
  const result: WorkerResult = { claimed: jobs.length, succeeded: 0, skipped: 0, deferred: 0, failed: 0 };

  for (const job of jobs) {
    const handler = HANDLERS.get(job.job_type);
    if (!handler) {
      await admin.rpc("fail_job", { p_id: job.id, p_error: `No handler for job_type "${job.job_type}"` });
      result.failed++;
      continue;
    }
    try {
      const outcome = await handler(job, { admin });
      if (outcome && "skipped" in outcome) {
        await admin.rpc("skip_job", { p_id: job.id, p_reason: outcome.skipped.slice(0, 500) });
        result.skipped++;
      } else if (outcome && "defer" in outcome) {
        await admin.rpc("defer_job", { p_id: job.id, p_reason: outcome.defer.slice(0, 500) } as never);
        result.deferred++;
      } else {
        await admin.rpc("complete_job", { p_id: job.id });
        result.succeeded++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await admin.rpc("fail_job", { p_id: job.id, p_error: message.slice(0, 500) });
      result.failed++;
    }
  }
  return result;
}

/** Drain due jobs until none remain (bounded). Used by reconciliation and tests. */
export async function drainJobs(admin: Admin, tenantId: string | null = null, maxBatches = 50): Promise<WorkerResult> {
  const total: WorkerResult = { claimed: 0, succeeded: 0, skipped: 0, deferred: 0, failed: 0 };
  for (let i = 0; i < maxBatches; i++) {
    const r = await runPendingJobs(admin, 20, tenantId);
    total.claimed += r.claimed;
    total.succeeded += r.succeeded;
    total.skipped += r.skipped;
    total.deferred += r.deferred;
    total.failed += r.failed;
    if (r.claimed === 0) break;
  }
  return total;
}
