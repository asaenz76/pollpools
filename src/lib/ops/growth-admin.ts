import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/ops/admin";

/**
 * Super-admin Growth & Health read layer (Phase 8-B.5 GRE.6). Operational, not
 * BI: a per-tenant overview plus the editable configuration. Reuses the same
 * calculation/service functions as the tenant dashboard (single source of truth).
 */

export type TenantGrowthRow = {
  tenantId: string;
  slug: string;
  displayName: string;
  planKey: string | null;
  planName: string | null;
  wau: number;
  qualification: string; // 'qualified' | 'at_risk' | '—'
  manualOverride: boolean;
  healthStatus: string;
  healthScore: number | null;
  healthBand: string | null;
  components: Record<string, number | null>;
  draftEnabled: boolean;
  supportEnabled: boolean;
};

/** All active tenants with plan + health at a glance (operational overview). */
export async function getAllTenantGrowth(): Promise<TenantGrowthRow[]> {
  await requireSuperAdmin();
  const admin = createAdminSupabase();
  const { data: tenants } = await admin.from("tenants").select("id, slug, display_name").eq("status", "active").order("display_name");

  const rows = await Promise.all(
    (tenants ?? []).map(async (t) => {
      const [assignment, state, healthRes, flags] = await Promise.all([
        admin.from("tenant_revenue_plan_assignments").select("revenue_plans(key, display_name)").eq("tenant_id", t.id).is("ended_at", null).maybeSingle(),
        admin.from("tenant_plan_state").select("current_wau, status, manual_override").eq("tenant_id", t.id).maybeSingle(),
        admin.rpc("community_health_now", { p_tenant: t.id } as never),
        admin.from("tenant_feature_flags").select("flag, enabled").eq("tenant_id", t.id).in("flag", ["creator_support_enabled"]),
      ]);
      const plan = assignment.data ? (Array.isArray(assignment.data.revenue_plans) ? assignment.data.revenue_plans[0] : assignment.data.revenue_plans) : null;
      const health = healthRes.data as unknown as { status: string; overall_score: number | null; band: string | null; components: { key: string; score: number | null }[] } | null;
      const components: Record<string, number | null> = {};
      for (const c of health?.components ?? []) components[c.key] = c.score;
      const supportEnabled = (flags.data ?? []).some((f) => f.flag === "creator_support_enabled" && f.enabled);
      const { count: draftCount } = await admin.from("competition_draft_settings").select("id", { count: "exact", head: true }).eq("tenant_id", t.id).eq("is_enabled", true);
      return {
        tenantId: t.id,
        slug: t.slug,
        displayName: t.display_name,
        planKey: plan?.key ?? null,
        planName: plan?.display_name ?? null,
        wau: state.data?.current_wau ?? 0,
        qualification: state.data?.status ?? "—",
        manualOverride: state.data?.manual_override ?? false,
        healthStatus: health?.status ?? "building_baseline",
        healthScore: health?.overall_score ?? null,
        healthBand: health?.band ?? null,
        components,
        draftEnabled: (draftCount ?? 0) > 0,
        supportEnabled,
      };
    }),
  );
  return rows;
}

export type HealthMetricConfig = {
  id: string;
  key: string;
  displayName: string;
  enabled: boolean;
  weight: number;
  maxScore: number;
  target: number;
  measurementWindowDays: number;
  requiresFeature: string | null;
  suggestion: string | null;
  displayOrder: number;
};

export async function getHealthMetricsConfig(): Promise<HealthMetricConfig[]> {
  await requireSuperAdmin();
  const admin = createAdminSupabase();
  const { data } = await admin.from("community_health_metrics").select("*").order("display_order");
  return (data ?? []).map((m) => ({
    id: m.id,
    key: m.key,
    displayName: m.display_name,
    enabled: m.enabled,
    weight: m.weight,
    maxScore: m.max_score,
    target: Number((m.scoring as Record<string, unknown>)?.target ?? 100),
    measurementWindowDays: m.measurement_window_days,
    requiresFeature: m.requires_feature,
    suggestion: m.suggestion,
    displayOrder: m.display_order,
  }));
}

export type WauConfig = {
  windowDays: number;
  minActions: number;
  signalPrediction: boolean;
  signalDraft: boolean;
  signalLogin: boolean;
  benchmarkMinTenants: number;
};

export async function getWauConfig(): Promise<WauConfig> {
  await requireSuperAdmin();
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("platform_config")
    .select("wau_window_days, wau_min_actions, wau_signal_prediction, wau_signal_draft, wau_signal_login, health_benchmark_min_tenants")
    .maybeSingle();
  return {
    windowDays: data?.wau_window_days ?? 7,
    minActions: data?.wau_min_actions ?? 1,
    signalPrediction: data?.wau_signal_prediction ?? true,
    signalDraft: data?.wau_signal_draft ?? true,
    signalLogin: data?.wau_signal_login ?? true,
    benchmarkMinTenants: data?.health_benchmark_min_tenants ?? 5,
  };
}
