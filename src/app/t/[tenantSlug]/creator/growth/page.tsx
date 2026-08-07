import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorWorkspace } from "@/features/creator/get-creator-workspace";
import { getTenantCurrentPlan, sharePercent } from "@/lib/growth/revenue-plans";
import { getTenantWau } from "@/lib/growth/wau";
import { getTenantPlanState, getNextMilestone } from "@/lib/growth/plan-state";
import { getCommunityHealth, getBenchmarks, getHealthBands, weakestComponent } from "@/lib/growth/community-health";
import { getPlatformStatus, getThisPeriodSummary, getSuccessTimeline } from "@/lib/growth/dashboard";
import { HealthMetricCard } from "@/components/growth/health-metric-card";
import { SuccessTimeline } from "@/components/growth/success-timeline";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  creator_support: "Creator Support",
  paid_competitor_draft: "Competitor Draft",
  platform_premium: "Platform Support",
};
const STATUS_TONE: Record<string, string> = {
  positive: "text-positive",
  warning: "text-streak",
  negative: "text-negative",
  muted: "text-muted-foreground",
};

export default async function GrowthDashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const workspace = await getCreatorWorkspace(ctx.tenant.id);
  if (!workspace) redirect(`/t/${ctx.tenant.slug}/creator`);

  const tenantId = ctx.tenant.id;
  const [plan, wau, planState, health, benchmarks, bands, platformStatus, thisPeriod, timeline] = await Promise.all([
    getTenantCurrentPlan(tenantId),
    getTenantWau(tenantId),
    getTenantPlanState(tenantId),
    getCommunityHealth(tenantId),
    getBenchmarks(),
    getHealthBands(),
    getPlatformStatus(tenantId),
    getThisPeriodSummary(tenantId),
    getSuccessTimeline(tenantId),
  ]);
  const nextMilestone = plan ? await getNextMilestone(tenantId, plan.tier, wau.current) : null;
  const band = health.band ? bands.find((b) => b.key === health.band) : null;
  const weakest = weakestComponent(health);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Growth</h1>
          <p className="mt-1 text-sm text-muted-foreground">Where you are, where you&apos;re going, and how far you&apos;ve come.</p>
        </div>
        <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Studio</Link>
      </header>

      {/* A. THIS PERIOD */}
      {thisPeriod ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">This period</h2>
            {thisPeriod.overall ? (
              <span className="text-sm font-medium tabular-nums">
                Community Health {thisPeriod.overall.from} → {thisPeriod.overall.to}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {thisPeriod.changes.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground">{c.label}</span>
                <span className={c.direction === "up" ? "text-positive" : c.direction === "down" ? "text-negative" : "text-muted-foreground"}>
                  {c.direction === "up" ? "↑" : c.direction === "down" ? "↓" : "•"} {c.note}
                </span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* B + C. CURRENT PLAN and NEXT MILESTONE — economics, kept apart from health */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Current Revenue Plan</h2>
            <span className="rounded-full border border-primary px-2.5 py-0.5 text-xs font-medium text-primary">{plan?.displayName ?? "—"}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{wau.current.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">WAU</span></p>
          {planState?.status === "at_risk" ? (
            <div className="mt-2 rounded-md bg-primary-subtle px-3 py-2 text-xs">
              <span className="font-medium text-streak">At Risk.</span> Your community dipped below the requirement.
              {planState.graceEndsAt ? <> Recover before {new Date(planState.graceEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} to keep your plan.</> : null}
            </div>
          ) : (
            <p className="mt-1 text-xs text-positive">Qualified</p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Your revenue shares</p>
            {(plan?.shares ?? []).map((sh) => (
              <div key={sh.productType} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{SOURCE_LABEL[sh.productType] ?? sh.productType}</span>
                <span className="tabular-nums">
                  <span className="font-medium text-positive">You receive {sharePercent(sh.creatorShareBps)}</span>
                  <span className="text-muted-foreground"> · Platform fee {sharePercent(sh.platformShareBps)}</span>
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <span>Platform Support</span>
              <span>100% supports the platform</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Next milestone</h2>
          {nextMilestone ? (
            <>
              <p className="mt-2 text-lg font-semibold">{nextMilestone.planName}</p>
              <p className="text-sm tabular-nums">{nextMilestone.currentWau.toLocaleString()} / {nextMilestone.minWau.toLocaleString()} WAU</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${nextMilestone.progressPct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{nextMilestone.progressPct}% of the way — {Math.max(0, nextMilestone.minWau - nextMilestone.currentWau).toLocaleString()} more WAU. Qualification is based on Revenue Plan criteria, not Community Health.</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">You&apos;re on the top automatic plan. 🎉</p>
          )}
        </div>
      </section>

      {/* D. COMMUNITY HEALTH — coaching */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">Community Health</h2>
            {health.status === "scored" ? (
              <p className="text-3xl font-semibold tabular-nums">
                {health.overallScore} <span className="text-base font-normal text-muted-foreground">/ 100</span>
                {band ? <span className={"ml-2 text-base font-medium " + (STATUS_TONE[band.tone] ?? "text-muted-foreground")}>{band.label}</span> : null}
              </p>
            ) : (
              <p className="text-xl font-semibold text-muted-foreground">Building your baseline</p>
            )}
          </div>
        </div>
        {weakest ? (
          <p className="mb-3 rounded-md bg-primary-subtle px-3 py-2 text-sm">
            <span className="font-medium">Focus next: </span>
            {weakest.suggestion ?? `Improve ${weakest.displayName}.`}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {health.components.map((m) => (
            <HealthMetricCard key={m.key} metric={m} benchmark={benchmarks[m.key]} />
          ))}
        </div>
        {Object.keys(benchmarks).length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Not enough platform data yet to show anonymous benchmarks.</p>
        ) : null}
      </section>

      {/* F. PLATFORM STATUS — separate, unscored */}
      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Platform Status</h2>
        <p className="mb-3 text-xs text-muted-foreground">Operational readiness. This is not scored and does not affect your Community Health.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {platformStatus.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <span className={"font-medium " + (STATUS_TONE[s.tone] ?? "text-muted-foreground")}>{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* G. SUCCESS TIMELINE */}
      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Success timeline</h2>
        <p className="mb-3 text-xs text-muted-foreground">Milestones worth celebrating.</p>
        <SuccessTimeline entries={timeline} />
      </section>
    </div>
  );
}
