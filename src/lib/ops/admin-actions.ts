"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { drainWithLease, monitorWithLease } from "@/lib/ops/scheduled";
import { reconcile, requeueActionableJobs, type ReconciliationScope, type ReconciliationMode } from "@/lib/ops/reconciliation";

/**
 * Admin operations actions (Phase 8-A). Every action is super-admin gated and runs
 * the existing, already-tested ops functions — the UI adds no new operational logic,
 * it just triggers what the pipeline already does. System ops (drain / monitor /
 * requeue / reconcile) use the service-role client; the financial PAYOUT actions use
 * the operator's session client so `reviewed_by` records who approved/rejected/paid.
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

/**
 * Moderate a comment (super-admin only). Uses SOFT status transitions
 * (visible / hidden / deleted) — never a hard delete — so the row and its body are
 * preserved for audit. Hidden/deleted comments are already excluded from public
 * view by the comments RLS select policy; this exposes the moderation the RLS
 * update policy already authorizes for super-admins.
 */
export async function setCommentStatusAction(
  tenantId: string,
  commentId: string,
  status: "visible" | "hidden" | "deleted",
): Promise<ActionResult> {
  await assertSuperAdmin();
  const { error } = await createAdminSupabase().from("comments").update({ status }).eq("id", commentId).eq("tenant_id", tenantId);
  revalidatePath(`/admin/tenants/${tenantId}/moderation`);
  if (error) return { ok: false, message: "Couldn't update the comment." };
  return { ok: true, message: `Comment set to ${status}.` };
}

/**
 * Payout operations (super-admin only). Each calls the existing, already-tested,
 * super-admin/service-role-gated payout RPC by payout id — the amount was set and
 * validated at REQUEST time (a BEFORE-INSERT trigger rejects amounts exceeding
 * available earnings), so NO client-controlled financial value is ever accepted
 * here. The RPCs preserve their own audit (allocations, reviewed_by/at, audit log).
 */
export async function approvePayoutAction(tenantId: string, payoutId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("approve_creator_payout", { p_payout_id: payoutId } as never);
  revalidatePath(`/admin/tenants/${tenantId}/payouts`);
  if (error) return { ok: false, message: error.message.includes("INSUFFICIENT_EARNINGS") ? "Rejected: request exceeds available earnings." : "Couldn't approve the payout." };
  return { ok: true, message: "Payout approved — earnings reserved." };
}

export async function rejectPayoutAction(tenantId: string, payoutId: string, reason: string): Promise<ActionResult> {
  await assertSuperAdmin();
  if (!reason.trim()) return { ok: false, message: "A rejection reason is required." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("reject_creator_payout", { p_payout_id: payoutId, p_reason: reason.trim() } as never);
  revalidatePath(`/admin/tenants/${tenantId}/payouts`);
  if (error) return { ok: false, message: "Couldn't reject the payout." };
  return { ok: true, message: "Payout rejected." };
}

export async function markPayoutPaidAction(tenantId: string, payoutId: string, reference: string): Promise<ActionResult> {
  await assertSuperAdmin();
  if (!reference.trim()) return { ok: false, message: "An external payment reference is required." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("mark_creator_payout_paid", { p_payout_id: payoutId, p_external_reference: reference.trim() } as never);
  revalidatePath(`/admin/tenants/${tenantId}/payouts`);
  if (error) return { ok: false, message: error.message.includes("NOT_APPROVED") ? "Only an approved payout can be marked paid." : "Couldn't mark the payout paid." };
  return { ok: true, message: "Payout marked paid." };
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
