import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorWorkspace } from "@/features/creator/get-creator-workspace";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VERIFICATION_LABEL: Record<string, string> = {
  unsubmitted: "Not submitted",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
  suspended: "Suspended",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-3 text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function CreatorStudioPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);

  const base = `/t/${ctx.tenant.slug}/creator`;
  const workspace = await getCreatorWorkspace(ctx.tenant.id);

  // Not a creator yet → onboarding CTA.
  if (!workspace) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Creator Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">Run competitions and collect predictions.</p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Become a creator</CardTitle>
            <CardDescription>
              Set up a creator profile to add competitors, publish races, and open prediction markets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`${base}/onboarding`} className={buttonVariants({ variant: "primary" })}>
              Get started
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { creator, competitions, events, stats } = workspace;
  const verified = creator.verificationStatus === "verified";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Creator Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">{creator.displayName}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-xs",
            verified ? "border-positive/40 text-positive" : "border-border text-muted-foreground",
          )}
        >
          {VERIFICATION_LABEL[creator.verificationStatus] ?? creator.verificationStatus}
        </span>
      </header>

      {!verified ? (
        <Card>
          <CardHeader>
            <CardTitle>Verification {creator.verificationStatus === "pending" ? "in review" : "needed"}</CardTitle>
            <CardDescription>
              Your creator profile is {VERIFICATION_LABEL[creator.verificationStatus]?.toLowerCase()}. You can build
              drafts now; a Super Admin verifies creators before their content is publicly listed.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Competitions" value={stats.competitions} />
        <Stat label="Events" value={stats.events} />
        <Stat label="Competitors" value={stats.competitors} />
        <Stat label="Predictions" value={stats.predictions} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/new`} className={buttonVariants({ variant: "primary", size: "sm" })}>Create</Link>
        <Link href={`${base}/competitors`} className={buttonVariants({ variant: "outline", size: "sm" })}>Competitors</Link>
        <Link href={`${base}/analytics`} className={buttonVariants({ variant: "outline", size: "sm" })}>Analytics</Link>
        <Link href={`${base}/profile`} className={buttonVariants({ variant: "outline", size: "sm" })}>Edit profile</Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your competitions</h2>
        {competitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {competitions.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/c/${c.id}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:bg-muted">
                  <span className="min-w-0 truncate font-medium">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{c.type.replace("_", " ").toLowerCase()}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`${base}/e/${e.id}/result`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:bg-muted">
                  <span className="min-w-0 truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
