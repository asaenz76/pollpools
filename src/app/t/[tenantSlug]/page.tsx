import Link from "next/link";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { ensureMembership } from "@/lib/tenant/membership";
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

  return (
    <div className="grid gap-6">
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
