import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Reconciliation, repair & operational-visibility service (§5H). A typed layer
 * over the SQL functions (which are the authority; all rebuild logic is reused,
 * not duplicated). Every operation is super-admin / service-role only and
 * tenant-scoped. Callers pass a service-role (admin) client; there is no
 * `server-only` guard so node integration tests can import this, and it is only
 * ever invoked from trusted server code (admin actions / the ops monitor).
 */
type Admin = SupabaseClient<Database>;

/** Minutes a job may sit in `running` before it is considered stuck. Configurable. */
export const JOB_STUCK_AFTER_MINUTES = 15;

export type ReconciliationScope = "user" | "event" | "settlement" | "competition" | "creator" | "season" | "tenant";
export type ReconciliationMode = "dry_run" | "repair" | "requeue";

export type ReconciliationResult = {
  run_id: string;
  status: "completed" | "completed_with_differences" | "failed" | "running";
  mode?: ReconciliationMode;
  scope_type?: ReconciliationScope;
  differences_found?: number;
  repairs_applied?: number;
  differences?: Record<string, { before: unknown; after: unknown }>;
  jobs_requeued?: number;
  idempotent?: boolean;
};

export type ProjectionJobStats = {
  pending: number; running: number; retrying: number; dead: number; stuck: number;
  succeeded: number; canceled: number; oldest_pending_seconds: number;
  by_type: Record<string, number>;
  recent_failures: { job_type: string; error: string }[];
};

export type ProjectionHealthState = "healthy" | "delayed" | "degraded" | "blocked" | "critical";
export type ProjectionHealth = {
  state: ProjectionHealthState;
  dead_letter_current: number;
  stuck: number;
  retrying_current: number;
  oldest_pending_seconds: number;
  reconciliation_failures_1h: number;
};

export async function reconcile(
  admin: Admin,
  args: { tenantId: string; scope: ReconciliationScope; scopeId?: string | null; mode: ReconciliationMode; idempotencyKey: string },
): Promise<ReconciliationResult> {
  const { data, error } = await admin.rpc("reconcile", {
    p_tenant: args.tenantId, p_scope_type: args.scope, p_scope_id: args.scopeId ?? null,
    p_mode: args.mode, p_idempotency_key: args.idempotencyKey,
  } as never);
  if (error) throw new Error(`reconcile: ${error.message}`);
  return data as unknown as ReconciliationResult;
}

export async function requeueActionableJobs(admin: Admin, tenantId: string, stuckMinutes = JOB_STUCK_AFTER_MINUTES): Promise<number> {
  const { data, error } = await admin.rpc("requeue_actionable_jobs", { p_tenant: tenantId, p_stuck_minutes: stuckMinutes } as never);
  if (error) throw new Error(`requeue_actionable_jobs: ${error.message}`);
  return (data as unknown as number) ?? 0;
}

export async function getProjectionJobStats(admin: Admin, tenantId: string, stuckMinutes = JOB_STUCK_AFTER_MINUTES): Promise<ProjectionJobStats> {
  const { data, error } = await admin.rpc("projection_job_stats", { p_tenant: tenantId, p_stuck_minutes: stuckMinutes } as never);
  if (error) throw new Error(`projection_job_stats: ${error.message}`);
  return data as unknown as ProjectionJobStats;
}

export async function getProjectionHealth(admin: Admin, tenantId: string): Promise<ProjectionHealth> {
  const { data, error } = await admin.rpc("projection_health", { p_tenant: tenantId } as never);
  if (error) throw new Error(`projection_health: ${error.message}`);
  return data as unknown as ProjectionHealth;
}

/**
 * Lightweight scheduled monitor (§5H rule 12): checks health and requeues
 * actionable failures (stuck / current dead-letter / retryable). It never runs a
 * full tenant rebuild — that stays a manual, explicitly-triggered operation.
 */
export async function runProjectionMonitor(admin: Admin, tenantId: string): Promise<{ health: ProjectionHealth; requeued: number }> {
  const health = await getProjectionHealth(admin, tenantId);
  let requeued = 0;
  if (health.state === "degraded" || health.state === "blocked" || health.stuck > 0) {
    requeued = await requeueActionableJobs(admin, tenantId);
  }
  return { health, requeued };
}
