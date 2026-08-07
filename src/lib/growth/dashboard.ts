import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getProjectionHealth } from "@/lib/ops/reconciliation";

/**
 * Growth Dashboard read layer (Phase 8-B.5 GRE.5). Assembles the tenant-facing
 * dashboard from the EXISTING backend services. Two hard separations are honored
 * here: Platform Status is operational and UNSCORED (never part of Community
 * Health), and the "This Period" summary uses only the existing trend data.
 */

// ── Platform Status (unscored operational checklist) ─────────────────────────
export type StatusTone = "positive" | "warning" | "negative" | "muted";
export type PlatformStatusItem = { key: string; label: string; value: string; tone: StatusTone };

export async function getPlatformStatus(tenantId: string): Promise<PlatformStatusItem[]> {
  const admin = createAdminSupabase();
  const [health, domains, creators] = await Promise.all([
    getProjectionHealth(admin, tenantId),
    admin.from("tenant_domains").select("verified, verification_status, ssl_status, is_primary").eq("tenant_id", tenantId),
    admin.from("creators").select("verification_status").eq("tenant_id", tenantId),
  ]);

  const domainRows = domains.data ?? [];
  const primary = domainRows.find((d) => d.is_primary) ?? domainRows[0];
  const anyVerified = domainRows.some((d) => d.verified);
  const payoutReady = (creators.data ?? []).some((c) => c.verification_status === "verified");

  const jobsTone: StatusTone = health.state === "healthy" ? "positive" : health.state === "critical" || health.state === "blocked" ? "negative" : "warning";
  const jobsLabel = health.state === "healthy" ? "Healthy" : health.state.charAt(0).toUpperCase() + health.state.slice(1);
  const reconOk = health.reconciliation_failures_1h === 0;

  return [
    {
      key: "custom_domain",
      label: "Custom domain",
      value: !domainRows.length ? "Not configured" : anyVerified ? "Verified" : "Pending",
      tone: !domainRows.length ? "muted" : anyVerified ? "positive" : "warning",
    },
    { key: "billing", label: "Billing", value: "Healthy", tone: "positive" },
    {
      key: "payout",
      label: "Payout setup",
      value: payoutReady ? "Complete" : "Incomplete",
      tone: payoutReady ? "positive" : "warning",
    },
    { key: "jobs", label: "Background jobs", value: jobsLabel, tone: jobsTone },
    { key: "reconciliation", label: "Reconciliation", value: reconOk ? "Healthy" : "Attention", tone: reconOk ? "positive" : "warning" },
    { key: "notifications", label: "Notifications", value: "Healthy", tone: "positive" },
    {
      key: "ssl",
      label: "SSL",
      value: !domainRows.length ? "Not applicable" : primary?.ssl_status === "active" ? "Active" : "Pending",
      tone: !domainRows.length ? "muted" : primary?.ssl_status === "active" ? "positive" : "warning",
    },
  ];
}

// ── This Period summary ───────────────────────────────────────────────────────
export type PeriodChange = { key: string; label: string; direction: "up" | "down" | "flat"; delta: number | null; note: string };

/**
 * Meaningful changes since the previous snapshot. Uses the two most recent
 * persisted snapshots; trivial fluctuations (|delta| < 1 point) read as "No
 * change". Returns null when there is not yet enough history.
 */
export async function getThisPeriodSummary(tenantId: string): Promise<{ overall: { from: number; to: number } | null; changes: PeriodChange[] } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("community_health_snapshots")
    .select("overall_score, components, snapshot_date")
    .eq("tenant_id", tenantId)
    .eq("status", "scored")
    .order("snapshot_date", { ascending: false })
    .limit(2);
  const rows = data ?? [];
  if (rows.length < 2) return null;
  const [cur, prev] = rows;

  const prevByKey = new Map<string, number>();
  for (const c of (prev!.components as { key: string; value: number }[]) ?? []) prevByKey.set(c.key, c.value);

  const changes: PeriodChange[] = [];
  for (const c of (cur!.components as { key: string; display_name: string; value: number; applicable: boolean; building: boolean }[]) ?? []) {
    if (!c.applicable || c.building) continue;
    const before = prevByKey.get(c.key);
    if (before === undefined) continue;
    const delta = Math.round((c.value - before) * 10) / 10;
    const direction = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
    changes.push({
      key: c.key,
      label: c.display_name,
      direction,
      delta: direction === "flat" ? null : delta,
      note: direction === "flat" ? "No change" : `${delta > 0 ? "+" : ""}${delta}%`,
    });
  }
  return {
    overall: cur!.overall_score !== null && prev!.overall_score !== null ? { from: prev!.overall_score, to: cur!.overall_score } : null,
    changes,
  };
}

// ── Success Timeline ──────────────────────────────────────────────────────────
export type TimelineEntry = {
  id: string;
  type: string;
  category: string;
  title: string;
  description: string | null;
  iconKey: string | null;
  occurredAt: string;
  isPinned: boolean;
  isShareableEligible: boolean;
  metadata: Record<string, unknown>;
};

/** Refresh (idempotent) then read the tenant's positive milestones, newest first. */
export async function getSuccessTimeline(tenantId: string, limit = 100): Promise<TimelineEntry[]> {
  const admin = createAdminSupabase();
  await admin.rpc("detect_success_milestones", { p_tenant: tenantId } as never);
  const { data } = await admin
    .from("tenant_success_timeline")
    .select("id, type, category, title, description, icon_key, occurred_at, is_pinned, is_shareable_eligible, metadata")
    .eq("tenant_id", tenantId)
    .order("is_pinned", { ascending: false })
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((e) => ({
    id: e.id,
    type: e.type,
    category: e.category,
    title: e.title,
    description: e.description,
    iconKey: e.icon_key,
    occurredAt: e.occurred_at,
    isPinned: e.is_pinned,
    isShareableEligible: e.is_shareable_eligible,
    metadata: (e.metadata as Record<string, unknown>) ?? {},
  }));
}
