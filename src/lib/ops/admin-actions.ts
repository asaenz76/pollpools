"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { drainWithLease, monitorWithLease } from "@/lib/ops/scheduled";
import { reconcile, requeueActionableJobs, type ReconciliationScope, type ReconciliationMode } from "@/lib/ops/reconciliation";

/**
 * Admin operations actions (Phase 8-A). Every action is super-admin gated and runs
 * the existing, already-tested ops functions through the service-role client — the
 * UI adds no new operational logic, it just triggers what the pipeline already does
 * (drain / monitor / reconcile / requeue).
 */
export type ActionResult = { ok: boolean; message: string };

async function assertSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) throw new Error("NOT_AUTHORIZED");
}

export async function drainTenantAction(tenantId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const run = await drainWithLease(createAdminSupabase(), { tenantId, holder: crypto.randomUUID() });
  revalidatePath(`/admin/tenants/${tenantId}`);
  if (!run.acquired) return { ok: true, message: "Another drain is already running for this tenant." };
  if (!run.ok) return { ok: false, message: `Drain failed: ${run.error ?? "unknown error"}` };
  const r = run.result!;
  return { ok: true, message: `Drained: ${r.claimed} claimed · ${r.succeeded} ok · ${r.deferred} deferred · ${r.deadLettered} dead-lettered (${run.durationMs}ms)` };
}

export async function runMonitorAction(tenantId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const run = await monitorWithLease(createAdminSupabase(), { tenantId, holder: crypto.randomUUID() });
  revalidatePath(`/admin/tenants/${tenantId}`);
  if (!run.acquired) return { ok: true, message: "Monitor is already running." };
  if (!run.ok) return { ok: false, message: `Monitor failed: ${run.error ?? "unknown error"}` };
  return { ok: true, message: `Monitor: requeued ${run.requeued} actionable job(s).` };
}

export async function requeueTenantAction(tenantId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const n = await requeueActionableJobs(createAdminSupabase(), tenantId);
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true, message: `Requeued ${n} actionable job(s).` };
}

export async function reconcileTenantAction(
  tenantId: string,
  scope: ReconciliationScope,
  scopeId: string | null,
  mode: ReconciliationMode,
): Promise<ActionResult> {
  await assertSuperAdmin();
  const res = await reconcile(createAdminSupabase(), { tenantId, scope, scopeId: scopeId || null, mode, idempotencyKey: crypto.randomUUID() });
  revalidatePath(`/admin/tenants/${tenantId}`);
  const diffs = res.differences_found ?? 0;
  const repairs = res.repairs_applied ?? 0;
  const requeued = res.jobs_requeued ?? 0;
  const detail =
    mode === "requeue" ? `${requeued} job(s) requeued`
    : mode === "repair" ? `${diffs} difference(s) found · ${repairs} repaired`
    : `${diffs} difference(s) found (dry run — nothing written)`;
  return { ok: true, message: `Reconcile ${mode} (${scope}): ${detail}.` };
}
