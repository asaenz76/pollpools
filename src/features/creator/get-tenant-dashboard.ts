import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { getTenantPlanState } from "@/lib/growth/plan-state";
import { getPlatformStatus } from "@/lib/growth/dashboard";
import { resolveTenantBrand } from "@/lib/theme/tenant-theme";

/**
 * Tenant Dashboard read layer (RX.5). Assembles the operator's "what needs my
 * attention / what's happening / what next" view entirely from EXISTING data — event
 * lifecycle state, plan state, platform status, and branding. No new scoring, no
 * duplicated analytics: Growth/Community Health/Revenue keep their own loaders and
 * are reused by the page. Reads use the service-role client (same pattern as the
 * growth loaders); the page itself is gated by creator ownership.
 */
export type AttentionTone = "warning" | "negative" | "info";
export type AttentionItem = { key: string; title: string; detail: string; href: string; cta: string; tone: AttentionTone };
export type DashEvent = { id: string; title: string; status: string; startsAt: string | null; locksAt: string | null; predictions: number };
export type ChecklistItem = { key: string; label: string; done: boolean; href: string };

export type TenantDashboard = {
  needsAttention: AttentionItem[];
  upcoming: DashEvent[];
  recentSettled: DashEvent[];
  checklist: ChecklistItem[];
  checklistDone: number;
  totals: { events: number; competitions: number; predictions: number };
};

const SOON_MS = 24 * 60 * 60 * 1000;

function fmtDate(ts: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(ts));
}

export async function getTenantDashboard(opts: {
  tenantId: string;
  creatorId: string;
  slug: string;
  theme: Record<string, unknown>;
  supportEnabled: boolean;
  competitionTerm: string;
}): Promise<TenantDashboard> {
  const { tenantId, creatorId, slug } = opts;
  const admin = createAdminSupabase();

  const [eventsRes, compsRes, planState, platformStatus] = await Promise.all([
    admin.from("events").select("id, title, status, starts_at, locks_at").eq("creator_id", creatorId).order("locks_at", { ascending: true }).limit(200),
    admin.from("competitions").select("id").eq("creator_id", creatorId),
    getTenantPlanState(tenantId),
    getPlatformStatus(tenantId),
  ]);
  const events = eventsRes.data ?? [];
  const competitions = compsRes.data ?? [];

  // Batched prediction counts per event (markets → predictions), no N+1.
  const eventIds = events.map((e) => e.id);
  const countByEvent = new Map<string, number>();
  let totalPredictions = 0;
  if (eventIds.length) {
    const { data: markets } = await admin.from("markets").select("id, event_id").in("event_id", eventIds);
    const marketToEvent = new Map((markets ?? []).map((m) => [m.id, m.event_id]));
    const marketIds = [...marketToEvent.keys()];
    if (marketIds.length) {
      const { data: preds } = await admin.from("predictions").select("market_id").in("market_id", marketIds);
      for (const p of preds ?? []) {
        const ev = marketToEvent.get(p.market_id);
        if (ev) { countByEvent.set(ev, (countByEvent.get(ev) ?? 0) + 1); totalPredictions += 1; }
      }
    }
  }
  const toDash = (e: (typeof events)[number]): DashEvent => ({ id: e.id, title: e.title, status: e.status, startsAt: e.starts_at, locksAt: e.locks_at, predictions: countByEvent.get(e.id) ?? 0 });

  const now = Date.now();
  const needsAttention: AttentionItem[] = [];

  // Locked events need a result (a locked event has no active settlement yet).
  for (const e of events.filter((e) => e.status === "locked")) {
    needsAttention.push({
      key: `result-${e.id}`, title: e.title,
      detail: `Locked · ${countByEvent.get(e.id) ?? 0} predictions · result needed`,
      href: `/t/${slug}/creator/e/${e.id}/result`, cta: "Submit result", tone: "warning",
    });
  }
  // Open events locking within 24h.
  for (const e of events.filter((e) => e.status === "open" && e.locks_at && new Date(e.locks_at).getTime() > now && new Date(e.locks_at).getTime() - now < SOON_MS)) {
    needsAttention.push({
      key: `soon-${e.id}`, title: e.title, detail: `Locks ${fmtDate(e.locks_at!)}`,
      href: `/t/${slug}/creator/e/${e.id}`, cta: "Review", tone: "info",
    });
  }
  // Revenue Plan at risk (coaching — never a health/plan conflation).
  if (planState?.status === "at_risk") {
    needsAttention.push({
      key: "plan-at-risk", title: "Revenue Plan at risk",
      detail: planState.graceEndsAt ? `Recover WAU before ${fmtDate(planState.graceEndsAt)} to keep your plan.` : "Grow weekly active users to recover.",
      href: `/t/${slug}/creator/growth`, cta: "View growth", tone: "negative",
    });
  }
  // Custom domain pending verification.
  const domain = platformStatus.find((s) => s.key === "custom_domain");
  if (domain?.tone === "warning") {
    needsAttention.push({
      key: "domain", title: "Domain verification pending",
      detail: "Your custom domain isn't verified yet.",
      href: `/t/${slug}/creator/settings`, cta: "Settings", tone: "warning",
    });
  }

  const upcoming = events.filter((e) => e.status === "open" || e.status === "locked").slice(0, 6).map(toDash);
  const recentSettled = events.filter((e) => e.status === "settled").slice(0, 3).map(toDash);

  // Setup checklist — completion derived from real data (never a manual flag).
  const brand = resolveTenantBrand(opts.theme);
  const hasLogo = Boolean(brand.logoLight || brand.logoDark);
  const publishedExists = events.some((e) => ["open", "locked", "settled", "voided", "canceled"].includes(e.status));
  const domainVerified = domain?.tone === "positive";
  const checklist: ChecklistItem[] = [
    { key: "logo", label: "Add your logo", done: hasLogo, href: `/t/${slug}/creator/settings` },
    { key: "competition", label: `Create your first ${opts.competitionTerm}`, done: competitions.length > 0, href: `/t/${slug}/creator/new` },
    { key: "event", label: "Create your first event", done: events.length > 0, href: `/t/${slug}/creator/new/standalone` },
    { key: "publish", label: "Publish your first prediction", done: publishedExists, href: `/t/${slug}/creator/new/standalone` },
    { key: "domain", label: "Connect your domain", done: domainVerified, href: `/t/${slug}/creator/settings` },
  ];
  if (opts.supportEnabled) {
    checklist.push({ key: "support", label: "Creator Support is on", done: true, href: `/t/${slug}/creator/settings` });
  }
  const checklistDone = checklist.filter((c) => c.done).length;

  return {
    needsAttention, upcoming, recentSettled, checklist, checklistDone,
    totals: { events: events.length, competitions: competitions.length, predictions: totalPredictions },
  };
}
