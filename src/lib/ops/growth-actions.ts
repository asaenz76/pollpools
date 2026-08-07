"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Super-admin Growth & Health configuration actions (Phase 8-B.5 GRE.6). No new
 * commercial logic — these validate and persist configuration on the existing
 * tables (super-admin RLS enforced) and write an audit entry. Revenue percentages,
 * qualification rules, and the health formula are Super-Admin-only by construction.
 */
export type ActionResult = { ok: boolean; message: string };

async function assertSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) throw new Error("NOT_AUTHORIZED");
}

async function audit(action: string, entityType: string, entityId: string | null, summary: string, metadata: Record<string, unknown> = {}) {
  const supabase = await createServerSupabase();
  await supabase.rpc("log_growth_change", { p_action: action, p_entity_type: entityType, p_entity_id: entityId, p_summary: summary, p_metadata: metadata } as never);
}

// ── Revenue plans ─────────────────────────────────────────────────────────────
export async function updatePlanShareAction(planKey: string, productType: string, creatorPercent: number): Promise<ActionResult> {
  await assertSuperAdmin();
  if (productType === "platform_premium") return { ok: false, message: "Platform Support is always 100% platform and cannot be shared." };
  const pct = Math.round(creatorPercent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false, message: "Enter a creator share between 0 and 100%." };
  const creatorBps = pct * 100;
  const supabase = await createServerSupabase();
  const { data: plan } = await supabase.from("revenue_plans").select("id").eq("key", planKey).single();
  if (!plan) return { ok: false, message: "Plan not found." };
  const { error } = await supabase
    .from("revenue_plan_shares")
    .update({ creator_share_basis_points: creatorBps, platform_share_basis_points: 10000 - creatorBps } as never)
    .eq("plan_id", plan.id)
    .eq("product_type", productType as never);
  if (error) return { ok: false, message: "Couldn't update the revenue share." };
  await audit("revenue_plan.share_updated", "revenue_plan", plan.id, `${planKey} ${productType} → creator ${pct}%`, { planKey, productType, creatorPercent: pct });
  revalidatePath("/admin/growth/plans");
  return { ok: true, message: `${planKey}: creator now receives ${pct}%.` };
}

export async function updatePlanConfigAction(planKey: string, input: {
  minWau: number; remainWau: number; minAccountAgeDays: number; requireVerification: boolean; gracePeriodDays: number; enabled: boolean;
}): Promise<ActionResult> {
  await assertSuperAdmin();
  if (input.remainWau > input.minWau) return { ok: false, message: "Remain WAU must be ≤ enter WAU (hysteresis)." };
  if ([input.minWau, input.remainWau, input.minAccountAgeDays, input.gracePeriodDays].some((n) => !Number.isFinite(n) || n < 0)) {
    return { ok: false, message: "Values must be non-negative numbers." };
  }
  const supabase = await createServerSupabase();
  const { data: plan } = await supabase.from("revenue_plans").select("id, qualification, is_default").eq("key", planKey).single();
  if (!plan) return { ok: false, message: "Plan not found." };
  const qualification = {
    ...(plan.qualification as Record<string, unknown>),
    min_wau: input.minWau, remain_wau: input.remainWau, min_account_age_days: input.minAccountAgeDays, require_verification: input.requireVerification,
  };
  const status = input.enabled ? "active" : "retired";
  const { error } = await supabase.from("revenue_plans").update({ qualification, grace_period_days: input.gracePeriodDays, status } as never).eq("id", plan.id);
  if (error) return { ok: false, message: "Couldn't update the plan." };
  await audit("revenue_plan.config_updated", "revenue_plan", plan.id, `${planKey} qualification/grace updated`, { planKey, ...input });
  revalidatePath("/admin/growth/plans");
  return { ok: true, message: `${planKey} updated.` };
}

export async function retirePlanAction(planKey: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { data: plan } = await supabase.from("revenue_plans").select("id, is_default").eq("key", planKey).single();
  if (!plan) return { ok: false, message: "Plan not found." };
  if (plan.is_default) return { ok: false, message: "The default plan cannot be retired." };
  const { error } = await supabase.from("revenue_plans").update({ status: "retired" } as never).eq("id", plan.id);
  if (error) return { ok: false, message: "Couldn't retire the plan." };
  await audit("revenue_plan.retired", "revenue_plan", plan.id, `${planKey} retired`, { planKey });
  revalidatePath("/admin/growth/plans");
  return { ok: true, message: `${planKey} retired (history preserved).` };
}

// ── Community Health config ──────────────────────────────────────────────────
export async function updateHealthMetricAction(key: string, input: { enabled: boolean; weight: number; maxScore: number; target: number; windowDays: number }): Promise<ActionResult> {
  await assertSuperAdmin();
  if (input.weight < 0 || input.maxScore <= 0 || input.target <= 0 || input.windowDays <= 0) {
    return { ok: false, message: "Weight ≥ 0, and max score / target / window must be > 0." };
  }
  const supabase = await createServerSupabase();
  // Guard against retiring the entire formula (at least one enabled metric must remain).
  if (!input.enabled) {
    const { count } = await supabase.from("community_health_metrics").select("id", { count: "exact", head: true }).eq("enabled", true).neq("key", key);
    if ((count ?? 0) === 0) return { ok: false, message: "At least one metric must stay enabled." };
  }
  const { data: metric } = await supabase.from("community_health_metrics").select("id").eq("key", key).single();
  if (!metric) return { ok: false, message: "Metric not found." };
  const { error } = await supabase
    .from("community_health_metrics")
    .update({ enabled: input.enabled, weight: input.weight, max_score: input.maxScore, scoring: { target: input.target }, measurement_window_days: input.windowDays } as never)
    .eq("id", metric.id);
  if (error) return { ok: false, message: "Couldn't update the metric." };
  await audit("community_health.metric_updated", "community_health_metric", metric.id, `${key} config updated (formula version bumped)`, { key, ...input });
  revalidatePath("/admin/growth/health");
  return { ok: true, message: `${key} updated. Historical snapshots are unchanged.` };
}

export async function updateWauConfigAction(input: { windowDays: number; minActions: number; signalPrediction: boolean; signalDraft: boolean; signalLogin: boolean; benchmarkMinTenants: number }): Promise<ActionResult> {
  await assertSuperAdmin();
  if (input.windowDays <= 0 || input.minActions <= 0 || input.benchmarkMinTenants <= 0) return { ok: false, message: "Window, minimum actions, and benchmark sample must be > 0." };
  if (!input.signalPrediction && !input.signalDraft && !input.signalLogin) return { ok: false, message: "At least one WAU signal must be enabled." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("platform_config").update({
    wau_window_days: input.windowDays, wau_min_actions: input.minActions,
    wau_signal_prediction: input.signalPrediction, wau_signal_draft: input.signalDraft, wau_signal_login: input.signalLogin,
    health_benchmark_min_tenants: input.benchmarkMinTenants,
  } as never).eq("id", true);
  if (error) return { ok: false, message: "Couldn't update the WAU definition." };
  await audit("growth.wau_config_updated", "platform_config", null, "WAU definition updated", { ...input });
  revalidatePath("/admin/growth/health");
  return { ok: true, message: "WAU definition updated." };
}

// ── Tenant plan management ───────────────────────────────────────────────────
export async function setOverrideAction(tenantId: string, planKey: string, reason: string): Promise<ActionResult> {
  await assertSuperAdmin();
  if (!reason.trim()) return { ok: false, message: "A reason is required for a manual override." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_plan_override", { p_tenant: tenantId, p_plan_key: planKey, p_reason: reason.trim() } as never);
  if (error) return { ok: false, message: "Couldn't set the override." };
  await audit("revenue_plan.override_set", "tenant", tenantId, `Manual override → ${planKey}`, { tenantId, planKey, reason: reason.trim() });
  revalidatePath("/admin/growth");
  return { ok: true, message: `Override set to ${planKey}. Automation is suspended.` };
}

export async function clearOverrideAction(tenantId: string, reason: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("clear_plan_override", { p_tenant: tenantId, p_reason: reason.trim() || "Re-enabled automatic qualification" } as never);
  if (error) return { ok: false, message: "Couldn't clear the override." };
  await audit("revenue_plan.override_cleared", "tenant", tenantId, "Automatic qualification re-enabled", { tenantId });
  revalidatePath("/admin/growth");
  return { ok: true, message: "Automatic qualification re-enabled." };
}

export async function evaluateTenantNowAction(tenantId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("evaluate_tenant_plan", { p_tenant: tenantId } as never);
  if (error) return { ok: false, message: "Evaluation failed." };
  revalidatePath("/admin/growth");
  return { ok: true, message: `Evaluated: ${data as string}.` };
}
