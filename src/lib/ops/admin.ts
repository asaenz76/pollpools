import "server-only";

import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getProjectionHealth, getProjectionJobStats, type ProjectionHealth, type ProjectionJobStats } from "@/lib/ops/reconciliation";

/**
 * Admin & operations data layer (Phase 8-A / F-23). Every function here is
 * super-admin only — the operator surface for the async settlement pipeline that
 * previously had no UI. Reads/acts through the service-role client behind an
 * explicit `requireSuperAdmin()` gate, mirroring the SQL functions' own
 * super-admin/service-role authorization.
 */

/** Throw a 404 unless the current user holds the platform super_admin grant. */
export async function requireSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) notFound();
}

export type TenantHealthRow = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  health: ProjectionHealth;
};

export type PlatformOverview = {
  tenants: TenantHealthRow[];
  totals: {
    tenants: number;
    unhealthy: number;
    deadLetterCurrent: number;
    stuck: number;
    retryingCurrent: number;
    reconciliationFailures1h: number;
  };
};

/** Cross-tenant operational overview: each tenant's projection health + roll-ups. */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const admin = createAdminSupabase();
  const { data: tenants } = await admin
    .from("tenants")
    .select("id, slug, display_name, status")
    .order("display_name");

  const rows: TenantHealthRow[] = await Promise.all(
    (tenants ?? []).map(async (t) => ({
      id: t.id,
      slug: t.slug,
      displayName: t.display_name,
      status: t.status,
      health: await getProjectionHealth(admin, t.id),
    })),
  );

  const totals = rows.reduce(
    (acc, r) => {
      if (r.health.state !== "healthy") acc.unhealthy += 1;
      acc.deadLetterCurrent += r.health.dead_letter_current;
      acc.stuck += r.health.stuck;
      acc.retryingCurrent += r.health.retrying_current;
      acc.reconciliationFailures1h += r.health.reconciliation_failures_1h;
      return acc;
    },
    { tenants: rows.length, unhealthy: 0, deadLetterCurrent: 0, stuck: 0, retryingCurrent: 0, reconciliationFailures1h: 0 },
  );

  return { tenants: rows, totals };
}

export type TenantOps = {
  id: string;
  slug: string;
  displayName: string;
  health: ProjectionHealth;
  stats: ProjectionJobStats;
};

/** Full operational detail for one tenant (health + job statistics). */
export async function getTenantOps(tenantId: string): Promise<TenantOps | null> {
  const admin = createAdminSupabase();
  const { data: tenant } = await admin.from("tenants").select("id, slug, display_name").eq("id", tenantId).maybeSingle();
  if (!tenant) return null;
  const [health, stats] = await Promise.all([getProjectionHealth(admin, tenantId), getProjectionJobStats(admin, tenantId)]);
  return { id: tenant.id, slug: tenant.slug, displayName: tenant.display_name, health, stats };
}
