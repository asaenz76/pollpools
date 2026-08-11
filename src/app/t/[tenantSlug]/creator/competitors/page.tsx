import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorWorkspace } from "@/features/creator/get-creator-workspace";
import { CompetitorForm, CompetitorEditForm } from "@/components/creator/forms";
import { CompetitorMark } from "@/components/domain/competitor-mark";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const ws = await getCreatorWorkspace(ctx.tenant.id);
  if (!ws) redirect(`/t/${ctx.tenant.slug}/creator`);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Competitors</h1>
        <p className="mt-1 text-sm text-muted-foreground">The marbles, drivers, or teams your events are about.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Add a competitor</CardTitle></CardHeader>
        <CardContent><CompetitorForm creatorId={ws.creator.id} /></CardContent>
      </Card>

      {ws.competitors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No competitors yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ws.competitors.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-card px-3 py-2.5 text-sm">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2">
                  <CompetitorMark name={c.name} colors={c.colors} identifier={c.identifier} imageUrl={c.imageUrl} size={22} />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">Edit</span>
                </summary>
                <div className="mt-3 border-t border-border pt-3">
                  <CompetitorEditForm competitor={{ id: c.id, name: c.name, colors: c.colors, identifier: c.identifier }} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
