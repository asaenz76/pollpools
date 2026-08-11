import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { drainJobs, type WorkerResult } from "@/lib/jobs";
import { runProjectionMonitor, type ProjectionHealth } from "@/lib/ops/reconciliation";

// No `import "server-only"` — this holds no secrets (the admin client is passed
// in) and is imported by node integration tests. It is only ever invoked from the
// internal cron routes, which authenticate via CRON_SECRET.
type Admin = SupabaseClient<Database>;

/** A crashed worker's lease auto-expires after this, so a partition is never held forever. */
const DRAIN_LEASE_TTL_SECONDS = 300;
const DEFAULT_MAX_BATCHES = 50;

export type DrainRun = {
  ok: boolean;
  /** false → another drain already owns this partition; this run did nothing (not an error). */
  acquired: boolean;
  partition: string;
  result: WorkerResult | null;
  durationMs: number;
  error?: string;
};

/**
 * Drain due jobs under a durable lease so two global drains cannot process the
 * same partition concurrently. Different tenants use different partitions and may
 * run in parallel. Bounded (maxBatches); respects the queue's retry/dead-letter
 * rules; emits structured logs; never swallows errors.
 */
export async function drainWithLease(
  admin: Admin,
  opts: { tenantId?: string | null; holder: string; maxBatches?: number; ttlSeconds?: number },
): Promise<DrainRun> {
  const tenantId = opts.tenantId ?? null;
  const partition = tenantId ? `jobs:${tenantId}` : "jobs:global";
  const start = Date.now();

  const { data: acquired, error: leaseErr } = await admin.rpc("acquire_worker_lease", {
    p_partition: partition,
    p_holder: opts.holder,
    p_ttl_seconds: opts.ttlSeconds ?? DRAIN_LEASE_TTL_SECONDS,
  } as never);
  if (leaseErr) {
    log({ event: "drain.lease_error", partition, error: leaseErr.message });
    return { ok: false, acquired: false, partition, result: null, durationMs: Date.now() - start, error: leaseErr.message };
  }
  if (!acquired) {
    log({ event: "drain.skipped_overlap", partition });
    return { ok: true, acquired: false, partition, result: null, durationMs: Date.now() - start };
  }

  log({ event: "drain.started", partition });
  try {
    // Auto-lock: flip events/markets whose scheduled lock time has passed into the
    // authoritative locked state — identical to what a manual lock_event produces
    // (0007 lock_due_markets, idempotent, open→locked only, never reopens). Run on
    // the global drain so it happens exactly once per tick.
    if (!tenantId) {
      const { data: locked, error: lockErr } = await admin.rpc("lock_due_markets" as never);
      if (lockErr) log({ event: "drain.autolock_error", partition, error: lockErr.message });
      else if (locked) log({ event: "drain.autolock", partition, lockedMarkets: locked });
    }
    const result = await drainJobs(admin, tenantId, opts.maxBatches ?? DEFAULT_MAX_BATCHES);
    const durationMs = Date.now() - start;
    log({ event: "drain.completed", partition, durationMs, ...result });
    return { ok: true, acquired: true, partition, result, durationMs };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const durationMs = Date.now() - start;
    log({ event: "drain.failed", partition, durationMs, error }); // visible, not swallowed
    return { ok: false, acquired: true, partition, result: null, durationMs, error };
  } finally {
    await admin.rpc("release_worker_lease", { p_partition: partition, p_holder: opts.holder } as never);
  }
}

export type MonitorRun = {
  ok: boolean;
  acquired: boolean;
  tenantsChecked: number;
  requeued: number;
  unhealthy: { tenantId: string; state: ProjectionHealth["state"] }[];
  durationMs: number;
  error?: string;
};

/**
 * Run the lightweight projection monitor across the tenants that currently have
 * non-terminal jobs (bounded work), requeuing actionable failures. Never runs a
 * full tenant rebuild. Held under a global lease so monitors don't overlap.
 */
export async function monitorWithLease(
  admin: Admin,
  opts: { holder: string; tenantId?: string | null; ttlSeconds?: number },
): Promise<MonitorRun> {
  const partition = opts.tenantId ? `monitor:${opts.tenantId}` : "monitor:global";
  const start = Date.now();

  const { data: acquired, error: leaseErr } = await admin.rpc("acquire_worker_lease", {
    p_partition: partition,
    p_holder: opts.holder,
    p_ttl_seconds: opts.ttlSeconds ?? DRAIN_LEASE_TTL_SECONDS,
  } as never);
  if (leaseErr) return { ok: false, acquired: false, tenantsChecked: 0, requeued: 0, unhealthy: [], durationMs: Date.now() - start, error: leaseErr.message };
  if (!acquired) {
    log({ event: "monitor.skipped_overlap", partition });
    return { ok: true, acquired: false, tenantsChecked: 0, requeued: 0, unhealthy: [], durationMs: Date.now() - start };
  }

  log({ event: "monitor.started", partition });
  try {
    const tenantIds = opts.tenantId ? [opts.tenantId] : await tenantsWithActiveJobs(admin);
    let requeued = 0;
    const unhealthy: MonitorRun["unhealthy"] = [];
    for (const tenantId of tenantIds) {
      const { health, requeued: n } = await runProjectionMonitor(admin, tenantId);
      requeued += n;
      if (health.state !== "healthy") unhealthy.push({ tenantId, state: health.state });
    }
    const durationMs = Date.now() - start;
    log({ event: "monitor.completed", partition, durationMs, tenantsChecked: tenantIds.length, requeued, unhealthy: unhealthy.length });
    return { ok: true, acquired: true, tenantsChecked: tenantIds.length, requeued, unhealthy, durationMs };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log({ event: "monitor.failed", partition, error });
    return { ok: false, acquired: true, tenantsChecked: 0, requeued: 0, unhealthy: [], durationMs: Date.now() - start, error };
  } finally {
    await admin.rpc("release_worker_lease", { p_partition: partition, p_holder: opts.holder } as never);
  }
}

/** Tenants with at least one non-terminal job — bounds monitor work to what matters. */
async function tenantsWithActiveJobs(admin: Admin): Promise<string[]> {
  const { data } = await admin
    .from("system_jobs")
    .select("tenant_id")
    .not("status", "in", "(succeeded,canceled)")
    .limit(10000);
  const ids = new Set<string>();
  for (const row of data ?? []) if (row.tenant_id) ids.add(row.tenant_id);
  return [...ids];
}

function log(payload: Record<string, unknown>): void {
  // Structured single-line JSON so a log drain can parse run metrics.
  console.info(JSON.stringify({ scope: "ops.scheduled", ...payload }));
}
