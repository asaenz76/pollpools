import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getProfileByHandle } from "@/features/social/get-profile";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const viewer = await getSessionUser();
  const profile = await getProfileByHandle(ctx.tenant.id, handle, viewer?.id ?? null);
  if (!profile) notFound();

  const publicProfiles = ctx.features.isEnabled("public_profiles_enabled");
  // Owner always sees their own; others see it when public profiles are enabled and this one is public.
  const showDetails = profile.isSelf || (publicProfiles && profile.isPublic);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">@{profile.handle}</p>
        {profile.bio ? <p className="mt-2 text-sm text-muted-foreground">{profile.bio}</p> : null}
      </header>

      {!showDetails ? (
        <Card>
          <CardHeader>
            <CardTitle>Private profile</CardTitle>
            <CardDescription>This member&apos;s activity isn&apos;t public.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {profile.stats ? (
            <div className="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-6">
              <Stat label="Points" value={profile.stats.totalPoints} />
              <Stat label="Correct" value={profile.stats.correct} />
              <Stat label="Accuracy" value={`${Math.round(profile.stats.accuracy * 100)}%`} />
              <Stat label="Streak" value={profile.stats.currentStreak} />
              <Stat label="Best" value={profile.stats.bestStreak} />
              <Stat label="Total" value={profile.stats.totalPredictions} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No predictions settled yet.</p>
          )}

          {profile.achievements.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Achievements</h2>
              <div className="flex flex-wrap gap-2">
                {profile.achievements.map((a) => (
                  <span key={a.name} className="rounded-full border border-border px-3 py-1 text-xs" title={a.description ?? undefined}>
                    {a.name}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Prediction history</h2>
            {profile.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No settled predictions yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {profile.history.map((h, i) => (
                  <li key={i}>
                    <Link
                      href={`/t/${ctx.tenant.slug}/e/${h.eventSlug}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 truncate">
                        {h.eventTitle} <span className="text-muted-foreground">· {h.optionLabel}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          h.outcome === "correct" ? "text-positive" : h.outcome === "incorrect" ? "text-negative" : "text-muted-foreground",
                        )}
                      >
                        {h.outcome === "correct" ? "Correct" : h.outcome === "incorrect" ? "Missed" : "Void"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
