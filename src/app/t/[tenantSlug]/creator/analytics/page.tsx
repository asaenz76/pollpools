import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorWorkspace } from "@/features/creator/get-creator-workspace";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-3 text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function CreatorAnalyticsPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const ws = await getCreatorWorkspace(ctx.tenant.id);
  if (!ws) redirect(`/t/${ctx.tenant.slug}/creator`);

  // Followers + per-event prediction participation.
  const supabase = await createServerSupabase();
  const { count: followers } = await supabase.from("creator_follows").select("*", { count: "exact", head: true }).eq("creator_id", ws.creator.id);

  const perEvent: { title: string; predictions: number }[] = [];
  for (const e of ws.events.slice(0, 15)) {
    const { data: markets } = await supabase.from("markets").select("id").eq("event_id", e.id);
    const marketIds = (markets ?? []).map((m) => m.id);
    let predictions = 0;
    if (marketIds.length) {
      const { count } = await supabase.from("predictions").select("*", { count: "exact", head: true }).in("market_id", marketIds);
      predictions = count ?? 0;
    }
    perEvent.push({ title: e.title, predictions });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Followers" value={followers ?? 0} />
        <Stat label="Events" value={ws.stats.events} />
        <Stat label="Predictions" value={ws.stats.predictions} />
        <Stat label="Competitions" value={ws.stats.competitions} />
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Participation by event</h2>
        {perEvent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {perEvent.map((e, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{e.title}</span>
                <span className="shrink-0 font-semibold tabular-nums">{e.predictions}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
