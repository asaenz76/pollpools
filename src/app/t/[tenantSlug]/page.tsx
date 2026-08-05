import Link from "next/link";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { ensureMembership } from "@/lib/tenant/membership";
import { listEvents } from "@/features/events/get-event";
import { listCompetitions } from "@/features/competitions/get-competition";
import { getLockState, formatCountdown } from "@/lib/domain/locking";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TenantHome() {
  // getTenantContext is memoized; the layout already guaranteed it is non-null.
  const ctx = await getTenantContext();
  if (!ctx) return null;
  const { tenant, features } = ctx;

  const user = await getSessionUser();
  if (user) {
    await ensureMembership({ tenantId: tenant.id, userId: user.id, email: user.email });
  }

  const [events, competitions] = await Promise.all([listEvents(tenant.id), listCompetitions(tenant.id)]);
  const now = new Date();

  const COMPETITION_TYPE_LABEL: Record<string, string> = {
    STANDALONE_EVENT: "Event",
    SEASON: "Season",
    TOURNAMENT: "Tournament",
    BRACKET: "Bracket",
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{tenant.displayName}</h1>
        {tenant.tagline ? <p className="mt-1 text-muted-foreground">{tenant.tagline}</p> : null}
        {tenant.description ? <p className="mt-3 text-sm text-muted-foreground">{tenant.description}</p> : null}
      </section>

      {user ? (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re in</CardTitle>
            <CardDescription>
              You&apos;re signed in to {tenant.displayName}. Competitions and predictions arrive next.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Join the community</CardTitle>
            <CardDescription>Create a free account to make predictions and build streaks.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href={`/t/${tenant.slug}/sign-up`} className={buttonVariants({ variant: "primary" })}>
              Create account
            </Link>
            <Link href={`/t/${tenant.slug}/sign-in`} className={buttonVariants({ variant: "outline" })}>
              Sign in
            </Link>
          </CardContent>
        </Card>
      )}

      {competitions.length > 0 ? (
        <section aria-labelledby="competitions-heading">
          <h2 id="competitions-heading" className="mb-3 text-sm font-medium text-muted-foreground">
            Competitions
          </h2>
          <ul className="flex flex-col gap-3">
            {competitions.map((c) => (
              <li key={c.id}>
                <Link href={`/t/${tenant.slug}/c/${c.slug}`} className="block">
                  <Card className="transition-colors hover:bg-muted">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-base">{c.title}</CardTitle>
                        <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                          {COMPETITION_TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className="mb-3 text-sm font-medium text-muted-foreground">
          Events
        </h2>
        {events.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No events yet</CardTitle>
              <CardDescription>Check back soon — new races are on the way.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((e) => {
              const lock = getLockState({
                marketStatus: e.status === "open" ? "open" : "locked",
                marketLocksAt: e.locksAt,
                now,
              });
              return (
                <li key={e.id}>
                  <Link href={`/t/${tenant.slug}/e/${e.slug}`} className="block">
                    <Card className="transition-colors hover:bg-muted">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-3">
                          <CardTitle className="text-base">{e.title}</CardTitle>
                          <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                            {lock.isOpen
                              ? lock.effectiveLocksAt
                                ? `Locks in ${formatCountdown(lock.msUntilLock)}`
                                : "Open"
                              : "Locked"}
                          </span>
                        </div>
                        {e.creator ? <CardDescription>by {e.creator}</CardDescription> : null}
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Enabled features">
        <div className="flex flex-wrap gap-2 text-xs">
          {(
            [
              ["Predictions", features.isEnabled("predictions_enabled")],
              ["Leaderboards", features.isEnabled("global_leaderboard_enabled")],
              ["Achievements", features.isEnabled("achievements_enabled")],
              ["Following", features.isEnabled("creator_following_enabled")],
              ["Creator support", features.isEnabled("creator_support_enabled")],
            ] as const
          ).map(([label, on]) => (
            <span
              key={label}
              className={
                "rounded-full border px-3 py-1 " +
                (on ? "border-border text-foreground" : "border-border text-muted-foreground opacity-60")
              }
            >
              {label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
