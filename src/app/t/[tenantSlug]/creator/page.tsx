import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { getTenantDashboard } from "@/features/creator/get-tenant-dashboard";
import { getTenantCurrentPlan } from "@/lib/growth/revenue-plans";
import { getTenantWau } from "@/lib/growth/wau";
import { getCommunityHealth } from "@/lib/growth/community-health";
import { getThisPeriodSummary } from "@/lib/growth/dashboard";
import { getCreatorRevenue, formatMoney } from "@/features/billing/get-billing";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { TenantManageNav } from "@/components/creator/manage-nav";
import { term } from "@/lib/vocabulary";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ATTENTION_TONE: Record<string, string> = {
  negative: "border-negative/40",
  warning: "border-streak/40",
  info: "border-primary/40",
};

export default async function TenantDashboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const base = `/t/${ctx.tenant.slug}/creator`;

  const creator = await getMyCreator(ctx.tenant.id);
  // Not a creator yet → the "Create Your PollPool" / become-a-creator entry.
  if (!creator) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Run a community</h1>
          <p className="mt-1 text-sm text-muted-foreground">Operate competitions and collect predictions in {ctx.tenant.displayName}.</p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Become a creator</CardTitle>
            <CardDescription>Set up a creator profile to add competitors, publish events, and open prediction markets.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`${base}/onboarding`} className={buttonVariants({ variant: "primary" })}>Get started</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenantId = ctx.tenant.id;
  const [dash, plan, wau, health, thisPeriod, revenue] = await Promise.all([
    getTenantDashboard({
      tenantId, creatorId: creator.id, slug: ctx.tenant.slug, theme: ctx.tenant.theme,
      supportEnabled: ctx.features.isEnabled("creator_support_enabled"),
      competitionTerm: term(ctx.vocabulary, "competition"),
    }),
    getTenantCurrentPlan(tenantId),
    getTenantWau(tenantId),
    getCommunityHealth(tenantId),
    getThisPeriodSummary(tenantId),
    getCreatorRevenue(tenantId, creator.id),
  ]);
  const verified = creator.verificationStatus === "verified";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{creator.displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your community at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          {!verified ? <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">Verification {creator.verificationStatus}</span> : null}
          <Link href={`/t/${ctx.tenant.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>View community</Link>
        </div>
      </header>

      <TenantManageNav slug={ctx.tenant.slug} current={base} />

      {/* NEEDS ATTENTION */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Needs attention</h2>
        {dash.needsAttention.length === 0 ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">You&apos;re all caught up. 🎉</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dash.needsAttention.map((a) => (
              <li key={a.key} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3", ATTENTION_TONE[a.tone])}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </div>
                <Link href={a.href} className={buttonVariants({ variant: a.tone === "negative" ? "primary" : "outline", size: "sm" })}>{a.cta}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* QUICK ACTIONS */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/new/standalone`} className={buttonVariants({ variant: "primary", size: "sm" })}>Create event</Link>
          <Link href={`${base}/new`} className={buttonVariants({ variant: "outline", size: "sm" })}>Create competition</Link>
          <Link href={`${base}/competitors`} className={buttonVariants({ variant: "outline", size: "sm" })}>Competitors</Link>
          <Link href={`/t/${ctx.tenant.slug}`} className={buttonVariants({ variant: "outline", size: "sm" })}>View community</Link>
        </div>
      </section>

      {/* UPCOMING */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Upcoming &amp; recent</h2>
        {dash.upcoming.length === 0 && dash.recentSettled.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet. <Link href={`${base}/new/standalone`} className="text-primary hover:underline">Create your first event</Link>.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...dash.upcoming, ...dash.recentSettled].map((e) => (
              <li key={e.id}>
                <Link href={`${base}/e/${e.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{e.predictions} pred.</span>
                  <EventStatusBadge status={e.status} className="shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* THIS PERIOD + GROWTH + REVENUE summary cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Growth</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{wau.current.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">WAU</span></p>
          <p className="mt-1 text-xs text-muted-foreground">Plan: <span className="font-medium text-foreground">{plan?.displayName ?? "—"}</span></p>
          <Link href={`${base}/growth`} className="mt-2 inline-block text-xs text-primary hover:underline">View growth →</Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Community Health</h2>
          {health.status === "scored" ? (
            <p className="mt-2 text-2xl font-semibold tabular-nums">{health.overallScore}<span className="text-sm font-normal text-muted-foreground"> / 100</span></p>
          ) : (
            <p className="mt-2 text-base font-medium text-muted-foreground">Building baseline</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Coaching only — never gates your plan.</p>
          <Link href={`${base}/growth`} className="mt-2 inline-block text-xs text-primary hover:underline">See metrics →</Link>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Revenue</h2>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{formatMoney(revenue.availableMinorUnits, revenue.currencyCode)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Available · {formatMoney(revenue.pendingMinorUnits, revenue.currencyCode)} pending</p>
          <Link href={`${base}/revenue`} className="mt-2 inline-block text-xs text-primary hover:underline">Manage payouts →</Link>
        </div>
      </section>

      {thisPeriod ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted-foreground">This period</h2>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
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

      {/* SETUP CHECKLIST — coaching only, derived from real data */}
      {dash.checklistDone < dash.checklist.length ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Set up your community ({dash.checklistDone}/{dash.checklist.length})</h2>
          <ul className="flex flex-col gap-1.5">
            {dash.checklist.map((c) => (
              <li key={c.key}>
                <Link href={c.href} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
                  <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border text-[10px]", c.done ? "border-positive bg-positive/15 text-positive" : "border-border text-transparent")}>✓</span>
                  <span className={c.done ? "text-muted-foreground line-through" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
