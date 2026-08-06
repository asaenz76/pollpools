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

export type ModerationComment = {
  id: string;
  body: string;
  status: string;
  authorName: string | null;
  subjectType: string;
  subjectId: string;
  createdAt: string;
};

/**
 * Recent comments for a tenant across all statuses (visible / hidden / deleted) so
 * a super-admin can moderate. Hidden/deleted comments are already suppressed from
 * public view by the comments RLS `select` policy — this reads them via the
 * service-role client behind the super-admin gate.
 */
export async function getModerationComments(tenantId: string, limit = 50): Promise<ModerationComment[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("comments")
    .select("id, body, status, user_id, subject_type, subject_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const comments = data ?? [];
  const userIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("user_id, display_name").in("user_id", userIds)
    : { data: [] as { user_id: string; display_name: string | null }[] };
  const nameBy = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name]));
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    status: c.status,
    authorName: nameBy.get(c.user_id) ?? null,
    subjectType: c.subject_type,
    subjectId: c.subject_id,
    createdAt: c.created_at,
  }));
}

export type ReconciliationRun = {
  id: string;
  scopeType: string;
  scopeId: string | null;
  mode: string;
  status: string;
  differencesFound: number;
  repairsApplied: number;
  jobsRequeued: number;
  error: string | null;
  createdAt: string;
};

/** Recent reconciliation_runs for a tenant (audit history of operator runs). */
export async function getReconciliationRuns(tenantId: string, limit = 15): Promise<ReconciliationRun[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("reconciliation_runs")
    .select("id, scope_type, scope_id, mode, status, differences_found, repairs_applied, jobs_requeued, error, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    scopeType: r.scope_type,
    scopeId: r.scope_id,
    mode: r.mode,
    status: r.status,
    differencesFound: r.differences_found,
    repairsApplied: r.repairs_applied,
    jobsRequeued: r.jobs_requeued,
    error: r.error,
    createdAt: r.created_at,
  }));
}
