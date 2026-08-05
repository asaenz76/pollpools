import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { ResultForm } from "@/components/creator/forms";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SubmitResultPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);

  const supabase = await createServerSupabase();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, status")
    .eq("id", eventId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!event) notFound();

  const { data: rows } = await supabase
    .from("event_competitors")
    .select("competitors(id, name, color)")
    .eq("event_id", event.id);
  const competitors = (rows ?? []).flatMap((r) => {
    const c = Array.isArray(r.competitors) ? r.competitors[0] : r.competitors;
    return c ? [{ id: c.id, name: c.name, color: c.color }] : [];
  });

  const settled = event.status === "settled" || event.status === "voided" || event.status === "canceled";

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Submit result</h1>
          <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>
        </div>
        <Link href={`/t/${ctx.tenant.slug}/e/${event.slug}`} className="shrink-0 text-sm text-primary hover:underline">View public</Link>
      </header>

      {settled ? (
        <Card>
          <CardHeader>
            <CardTitle>Already settled</CardTitle>
            <CardDescription>This event has been settled. A Super Admin can correct the result if needed.</CardDescription>
          </CardHeader>
        </Card>
      ) : !creator.settlementEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Awaiting admin settlement</CardTitle>
            <CardDescription>
              A Super Admin settles results for your events. Ask an admin to enable direct settlement to submit results yourself.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : competitors.length < 2 ? (
        <p className="text-sm text-muted-foreground">This event has no competitors to choose a winner from.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Choose the winner. Settlement grades predictions, updates streaks, and refreshes leaderboards.</p>
          <ResultForm eventId={event.id} competitors={competitors} />
        </>
      )}
    </div>
  );
}
