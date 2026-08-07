import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import type { BillingProductType } from "@/types/enums";

/**
 * Revenue Plan read layer (Phase 8-B.5). Revenue Plans control ECONOMICS — the
 * revenue SHARE per source for a tenant — and are distinct from Subscription
 * Plans (features). Shares are visible to tenants for transparency but only the
 * Super Admin may change them (enforced by RLS + `assign_revenue_plan`). This
 * module only reads; it never computes or mutates the split (that stays in
 * `app.resolve_revenue_split`).
 */

/** Basis points → a friendly whole-or-one-decimal percent string. */
export function sharePercent(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
}

export type RevenuePlanShare = {
  productType: BillingProductType;
  creatorShareBps: number;
  platformShareBps: number;
};

export type RevenuePlan = {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  tier: number;
  status: string;
  isDefault: boolean;
  qualification: Record<string, unknown>;
  featureEligibility: Record<string, unknown>;
  gracePeriodDays: number;
  displayOrder: number;
  shares: RevenuePlanShare[];
};

function mapShares(rows: { product_type: string; creator_share_basis_points: number; platform_share_basis_points: number }[]): RevenuePlanShare[] {
  return rows.map((s) => ({
    productType: s.product_type as BillingProductType,
    creatorShareBps: s.creator_share_basis_points,
    platformShareBps: s.platform_share_basis_points,
  }));
}

/** All revenue plans (with their shares), ordered by ladder position. */
export async function getRevenuePlans(): Promise<RevenuePlan[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("revenue_plans")
    .select(
      "id, key, display_name, description, tier, status, is_default, qualification, feature_eligibility, grace_period_days, display_order, revenue_plan_shares(product_type, creator_share_basis_points, platform_share_basis_points)",
    )
    .order("tier", { ascending: true });
  return (data ?? []).map((p) => ({
    id: p.id,
    key: p.key,
    displayName: p.display_name,
    description: p.description,
    tier: p.tier,
    status: p.status,
    isDefault: p.is_default,
    qualification: (p.qualification as Record<string, unknown>) ?? {},
    featureEligibility: (p.feature_eligibility as Record<string, unknown>) ?? {},
    gracePeriodDays: p.grace_period_days,
    displayOrder: p.display_order,
    shares: mapShares(p.revenue_plan_shares ?? []),
  }));
}

export type PlanAssignment = {
  id: string;
  planId: string;
  planKey: string;
  planName: string;
  assignmentType: string;
  reason: string | null;
  assignedAt: string;
  endedAt: string | null;
};

/** A tenant's current plan (the assignment with no ended_at), with its shares. */
export async function getTenantCurrentPlan(tenantId: string): Promise<RevenuePlan | null> {
  const admin = createAdminSupabase();
  const { data: assignment } = await admin
    .from("tenant_revenue_plan_assignments")
    .select("plan_id")
    .eq("tenant_id", tenantId)
    .is("ended_at", null)
    .maybeSingle();
  if (!assignment) return null;
  const plans = await getRevenuePlans();
  return plans.find((p) => p.id === assignment.plan_id) ?? null;
}

/** Immutable plan assignment history for a tenant (newest first). */
export async function getTenantPlanHistory(tenantId: string, limit = 25): Promise<PlanAssignment[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenant_revenue_plan_assignments")
    .select("id, plan_id, assignment_type, reason, assigned_at, ended_at, revenue_plans(key, display_name)")
    .eq("tenant_id", tenantId)
    .order("assigned_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((a) => {
    const plan = Array.isArray(a.revenue_plans) ? a.revenue_plans[0] : a.revenue_plans;
    return {
      id: a.id,
      planId: a.plan_id,
      planKey: plan?.key ?? "",
      planName: plan?.display_name ?? "",
      assignmentType: a.assignment_type,
      reason: a.reason,
      assignedAt: a.assigned_at,
      endedAt: a.ended_at,
    };
  });
}
