import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorWorkspace } from "@/features/creator/get-creator-workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { EventForm } from "@/components/creator/forms";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ManageCompetitionPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const ws = await getCreatorWorkspace(ctx.tenant.id);
  if (!ws) redirect(`/t/${ctx.tenant.slug}/creator`);

  const supabase = await createServerSupabase();
  const { data: competition } = await supabase
    .from("competitions")
    .select("id, title, type, slug")
    .eq("id", competitionId)
    .eq("creator_id", ws.creator.id)
    .maybeSingle();
  if (!competition) notFound();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, slug, status")
    .eq("competition_id", competition.id)
    .order("created_at", { ascending: false });

  const isBracket = competition.type === "BRACKET";

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{competition.type.replace("_", " ")}</span>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{competition.title}</h1>
        </div>
        <Link href={`/t/${ctx.tenant.slug}/c/${competition.slug}`} className="shrink-0 text-sm text-primary hover:underline">View public</Link>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Events</h2>
        {(events ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/t/${ctx.tenant.slug}/creator/e/${e.id}/result`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-sm hover:bg-muted">
                  <span className="min-w-0 truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isBracket ? (
        <p className="text-sm text-muted-foreground">Bracket matchups are generated automatically and advance as you submit results.</p>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Add an event</CardTitle></CardHeader>
          <CardContent>
            {ws.competitors.length < 2 ? (
              <p className="text-sm text-muted-foreground">
                Add at least 2 <Link href={`/t/${ctx.tenant.slug}/creator/competitors`} className="text-primary hover:underline">competitors</Link> first.
              </p>
            ) : (
              <EventForm creatorId={ws.creator.id} tenantSlug={ctx.tenant.slug} competitionId={competition.id} competitors={ws.competitors} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
