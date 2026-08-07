import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Revenue Plan operational state read layer (Phase 8-B.5 GRE.3): the tenant's
 * qualification status (qualified / at_risk), grace window, last measured WAU,
 * and manual-override flag. The immutable record is the assignment history
 * (see revenue-plans.ts); this is the current mutable state.
 */
export type TenantPlanState = {
  status: "qualified" | "at_risk";
  currentWau: number;
  atRiskSince: string | null;
  graceEndsAt: string | null;
  manualOverride: boolean;
  overrideReason: string | null;
  lastEvaluatedAt: string | null;
};

export async function getTenantPlanState(tenantId: string): Promise<TenantPlanState | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenant_plan_state")
    .select("status, current_wau, at_risk_since, grace_ends_at, manual_override, override_reason, last_evaluated_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return {
    status: data.status as "qualified" | "at_risk",
    currentWau: data.current_wau,
    atRiskSince: data.at_risk_since,
    graceEndsAt: data.grace_ends_at,
    manualOverride: data.manual_override,
    overrideReason: data.override_reason,
    lastEvaluatedAt: data.last_evaluated_at,
  };
}

/**
 * The next plan up the ladder from the tenant's current plan (for the "Next
 * Milestone" card), with its WAU requirement. Uses explicit Revenue Plan
 * qualification — NOT Community Health.
 */
export type NextMilestone = {
  planKey: string;
  planName: string;
  minWau: number;
  currentWau: number;
  progressPct: number;
};

export async function getNextMilestone(tenantId: string, currentTier: number, currentWau: number): Promise<NextMilestone | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("revenue_plans")
    .select("key, display_name, tier, qualification")
    .eq("status", "active")
    .gt("tier", currentTier)
    .order("tier", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const minWau = Number((data.qualification as Record<string, unknown>)?.min_wau ?? 0);
  const progressPct = minWau > 0 ? Math.min(100, Math.round((currentWau / minWau) * 100)) : 100;
  return { planKey: data.key, planName: data.display_name, minWau, currentWau, progressPct };
}
