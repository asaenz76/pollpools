import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EventEditForm, type EventEditInitial } from "@/components/creator/event-edit-form";

export const dynamic = "force-dynamic";

/** ISO → a `YYYY-MM-DDTHH:mm` value for <input type="datetime-local">. */
function toLocalInput(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<{ tenantSlug: string; eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);
  const base = `/t/${ctx.tenant.slug}/creator/e/${eventId}`;

  const supabase = await createServerSupabase();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, status, starts_at, locks_at, youtube_url, external_url")
    .eq("id", eventId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!event) notFound();

  // Terminal events aren't editable.
  if (event.status === "settled" || event.status === "voided" || event.status === "canceled") {
    return (
      <div className="flex flex-col gap-5">
        <Link href={base} className="text-sm text-muted-foreground hover:underline">← Back</Link>
        <Card>
          <CardHeader>
            <CardTitle>Can&apos;t edit this event</CardTitle>
            <CardDescription>A settled, voided, or canceled event can no longer be edited.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { data: marketRows } = await supabase
    .from("markets")
    .select("question, market_options(id, label, display_order)")
    .eq("event_id", event.id)
    .order("created_at");
  const marketQuestion = marketRows?.[0]?.question ?? "";
  const options = (marketRows ?? []).flatMap((m) =>
    (m.market_options ?? [])
      .slice()
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((o) => ({ id: o.id, label: o.label })),
  );

  // Zero predictions across this event's markets → structural edits allowed.
  const { data: mkts } = await supabase.from("markets").select("id").eq("event_id", event.id);
  const ids = (mkts ?? []).map((m) => m.id);
  let hasPredictions = false;
  if (ids.length) {
    const { count } = await supabase.from("predictions").select("*", { count: "exact", head: true }).in("market_id", ids);
    hasPredictions = (count ?? 0) > 0;
  }

  const initial: EventEditInitial = {
    title: event.title,
    description: event.description ?? "",
    startsAt: toLocalInput(event.starts_at),
    locksAt: toLocalInput(event.locks_at),
    youtubeUrl: event.youtube_url ?? "",
    externalUrl: event.external_url ?? "",
    marketQuestion,
  };
  const timingEditable = event.status === "draft" || event.status === "open";

  return (
    <div className="flex flex-col gap-5">
      <Link href={base} className="text-sm text-muted-foreground hover:underline">← Back to event</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Edit event</h1>
        <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>
      </header>
      <EventEditForm
        eventId={event.id}
        tenantSlug={ctx.tenant.slug}
        initial={initial}
        options={options}
        hasPredictions={hasPredictions}
        timingEditable={timingEditable}
      />
    </div>
  );
}
