import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { createServerSupabase } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { EventManage } from "@/components/creator/event-manage";
import type { EventStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ts));
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

export default async function EventManagePage({ params }: { params: Promise<{ tenantSlug: string; eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);
  const base = `/t/${ctx.tenant.slug}/creator`;

  const supabase = await createServerSupabase();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, slug, status, starts_at, locks_at")
    .eq("id", eventId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!event) notFound();
  const status = event.status as EventStatus;

  // Prediction volume across this event's markets.
  const { data: markets } = await supabase.from("markets").select("id").eq("event_id", event.id);
  const marketIds = (markets ?? []).map((m) => m.id);
  let predictions = 0;
  if (marketIds.length) {
    const { count } = await supabase.from("predictions").select("*", { count: "exact", head: true }).in("market_id", marketIds);
    predictions = count ?? 0;
  }

  // Current authoritative result label (latest grading version), if any.
  let resultLabel: string | null = null;
  const { data: resultRows } = await supabase
    .from("event_result_options")
    .select("grading_version, market_options(label, display_order)")
    .eq("event_id", event.id)
    .order("grading_version", { ascending: false });
  if (resultRows && resultRows.length) {
    const latest = resultRows[0]!.grading_version;
    resultLabel = resultRows
      .filter((r) => r.grading_version === latest)
      .map((r) => (r.market_options as { label: string } | null)?.label)
      .filter(Boolean)
      .join(", ") || null;
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={base} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
            <EventStatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Manage this event&apos;s lifecycle.</p>
        </div>
        <Link href={`/t/${ctx.tenant.slug}/e/${event.slug}`} className="shrink-0 text-sm text-primary hover:underline">View public</Link>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Meta label="Start" value={fmt(event.starts_at)} />
        <Meta label="Locks" value={fmt(event.locks_at)} />
        <Meta label="Predictions" value={String(predictions)} />
      </div>

      {status === "settled" && resultLabel ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Result</p>
            <p className="mt-0.5 text-lg font-semibold">{resultLabel}</p>
          </CardContent>
        </Card>
      ) : null}

      {status === "canceled" ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            This event was canceled. Submitted predictions are preserved for history and don&apos;t affect statistics or leaderboards.
          </CardContent>
        </Card>
      ) : null}

      {status === "voided" ? (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            This result was voided. Predictions were regraded as void; you can correct the result if needed.
          </CardContent>
        </Card>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Actions</h2>
        <EventManage eventId={event.id} tenantSlug={ctx.tenant.slug} status={status} settlementEnabled={creator.settlementEnabled} />
      </section>
    </div>
  );
}
