import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Community Health read layer (Phase 8-B.5 GRE.4). Community Health is a COACHING
 * system — it never determines Revenue Plans, billing, or qualification. This
 * module reads the deterministic, formula-versioned score computed in the database
 * (`community_health_now`), historical snapshots, and anonymous benchmarks. It
 * never recomputes the formula in TS.
 */

export type HealthComponent = {
  key: string;
  displayName: string;
  applicable: boolean;
  building: boolean;
  raw: number;
  value: number;
  score: number | null;
  maxScore: number;
  weight: number;
  target: number;
  suggestion: string | null;
  windowDays: number;
  extra: Record<string, unknown>;
};

export type CommunityHealth = {
  tenantId: string;
  status: "scored" | "building_baseline";
  overallScore: number | null;
  band: string | null;
  formulaVersion: number;
  windowDays: number;
  components: HealthComponent[];
};

type RawHealth = {
  tenant_id: string;
  status: "scored" | "building_baseline";
  overall_score: number | null;
  band: string | null;
  formula_version: number;
  window_days: number;
  components: {
    key: string;
    display_name: string;
    applicable: boolean;
    building: boolean;
    raw: number;
    value: number;
    score: number | null;
    max_score: number;
    weight: number;
    target: number;
    suggestion: string | null;
    window_days: number;
    extra: Record<string, unknown>;
  }[];
};

function mapHealth(h: RawHealth): CommunityHealth {
  return {
    tenantId: h.tenant_id,
    status: h.status,
    overallScore: h.overall_score,
    band: h.band,
    formulaVersion: h.formula_version,
    windowDays: h.window_days,
    components: (h.components ?? []).map((c) => ({
      key: c.key,
      displayName: c.display_name,
      applicable: c.applicable,
      building: c.building,
      raw: c.raw,
      value: c.value,
      score: c.score,
      maxScore: c.max_score,
      weight: c.weight,
      target: c.target,
      suggestion: c.suggestion,
      windowDays: c.window_days,
      extra: c.extra ?? {},
    })),
  };
}

/** Current (on-demand) Community Health for a tenant. */
export async function getCommunityHealth(tenantId: string, asOf?: Date): Promise<CommunityHealth> {
  const admin = createAdminSupabase();
  const { data } = await admin.rpc("community_health_now", {
    p_tenant: tenantId,
    ...(asOf ? { p_as_of: asOf.toISOString() } : {}),
  } as never);
  return mapHealth(data as unknown as RawHealth);
}

export type HealthHistoryPoint = { date: string; overallScore: number | null; band: string | null; status: string };

/** Persisted daily snapshots for the trend chart (oldest → newest). */
export async function getCommunityHealthHistory(tenantId: string, days = 30): Promise<HealthHistoryPoint[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("community_health_snapshots")
    .select("snapshot_date, overall_score, band_key, status")
    .eq("tenant_id", tenantId)
    .order("snapshot_date", { ascending: false })
    .limit(days);
  return (data ?? [])
    .map((s) => ({ date: s.snapshot_date, overallScore: s.overall_score, band: s.band_key, status: s.status }))
    .reverse();
}

export type Benchmark = { median: number; top10: number; n: number };

/** Anonymous per-metric platform benchmarks (only present when enough tenants qualify). */
export async function getBenchmarks(): Promise<Record<string, Benchmark>> {
  const admin = createAdminSupabase();
  const { data } = await admin.rpc("community_health_benchmarks");
  return (data as unknown as Record<string, Benchmark>) ?? {};
}

/** The weakest scored component (drives the primary coaching suggestion). */
export function weakestComponent(health: CommunityHealth): HealthComponent | null {
  const scored = health.components.filter((c) => c.applicable && !c.building && c.score !== null);
  if (scored.length === 0) return null;
  return scored.reduce((worst, c) => (c.score! / c.maxScore < worst.score! / worst.maxScore ? c : worst));
}
