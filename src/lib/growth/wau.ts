import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Weekly Active Users read layer (Phase 8-B.5 GRE.2). WAU is the primary growth
 * signal; its definition (signals, window, minimum actions) is configuration on
 * platform_config. This module only reads the configured, set-based value from
 * the database (`tenant_wau_current`) — it never redefines the formula.
 */
export type WauSnapshot = {
  current: number;
  previous: number;
  windowDays: number;
  /** Percentage change vs the previous window; null when the previous was zero. */
  changePct: number | null;
  direction: "up" | "down" | "flat";
};

export async function getTenantWau(tenantId: string, asOf?: Date): Promise<WauSnapshot> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .rpc("tenant_wau_current", { p_tenant: tenantId, ...(asOf ? { p_as_of: asOf.toISOString() } : {}) } as never)
    .single();
  const row = (data as { current_wau: number; previous_wau: number; window_days: number } | null) ?? {
    current_wau: 0,
    previous_wau: 0,
    window_days: 7,
  };
  const current = row.current_wau;
  const previous = row.previous_wau;
  const changePct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  return { current, previous, windowDays: row.window_days, changePct, direction };
}
