import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { ResultForm, CorrectResultForm } from "@/components/creator/forms";
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

  // The authoritative result is a market OPTION (which may be a non-competitor
  // outcome like "Draw"), so present the options rather than competitors.
  const { data: marketRows } = await supabase
    .from("markets")
    .select("id, market_options(id, label, competitor_id, color, display_order)")
    .eq("event_id", event.id)
    .neq("status", "draft")
    .order("created_at");
  const options = (marketRows ?? []).flatMap((m) =>
    (m.market_options ?? [])
      .slice()
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((o) => ({ id: o.id, label: o.label, competitorId: o.competitor_id, color: o.color })),
  );

  const isSettled = event.status === "settled" || event.status === "voided";
  const isCanceled = event.status === "canceled";
  const base = `/t/${ctx.tenant.slug}/creator/e/${event.id}`;

  // Current authoritative result label (latest grading version), for corrections.
  let currentLabel: string | null = null;
  if (isSettled) {
    const { data: rows } = await supabase
      .from("event_result_options")
      .select("grading_version, market_options(label)")
      .eq("event_id", event.id)
      .order("grading_version", { ascending: false });
    if (rows && rows.length) {
      const latest = rows[0]!.grading_version;
      currentLabel = rows.filter((r) => r.grading_version === latest).map((r) => (r.market_options as { label: string } | null)?.label).filter(Boolean).join(", ") || null;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={base} className="text-sm text-muted-foreground hover:underline">← Back to event</Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isSettled ? "Correct result" : "Submit result"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>
        </div>
        <Link href={`/t/${ctx.tenant.slug}/e/${event.slug}`} className="shrink-0 text-sm text-primary hover:underline">View public</Link>
      </header>

      {isCanceled ? (
        <Card>
          <CardHeader>
            <CardTitle>Event canceled</CardTitle>
            <CardDescription>A canceled event has no result to submit.</CardDescription>
          </CardHeader>
        </Card>
      ) : !creator.settlementEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>{isSettled ? "Corrections are reviewed by an admin" : "Awaiting admin settlement"}</CardTitle>
            <CardDescription>
              A Super Admin {isSettled ? "corrects" : "settles"} results for your events. Ask an admin to enable direct settlement to do this yourself.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : options.length < 2 ? (
        <p className="text-sm text-muted-foreground">This event has no market options to choose a result from.</p>
      ) : isSettled ? (
        <>
          <p className="text-sm text-muted-foreground">Correcting creates a new grading version. The previous result stays in history; predictions are regraded and standings updated.</p>
          <CorrectResultForm eventId={event.id} options={options} currentLabel={currentLabel} />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Select the result. Once confirmed, predictions will be graded and standings updated.</p>
          <ResultForm eventId={event.id} options={options} />
        </>
      )}
    </div>
  );
}
