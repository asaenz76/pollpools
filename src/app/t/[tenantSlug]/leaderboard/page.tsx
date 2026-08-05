import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getGlobalLeaderboard, type LeaderboardRow } from "@/features/leaderboard/get-leaderboard";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function medalClass(rank: number | null): string {
  if (rank === 1) return "text-medal-gold";
  if (rank === 2) return "text-medal-silver";
  if (rank === 3) return "text-medal-bronze";
  return "text-muted-foreground";
}

function Row({ row }: { row: LeaderboardRow }) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3">
      <span className={cn("w-8 shrink-0 text-center text-sm font-semibold tabular-nums", medalClass(row.rank))}>
        {row.rank ?? "—"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.displayName}</p>
        {row.handle ? <p className="truncate text-xs text-muted-foreground">@{row.handle}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">{row.totalPoints} pts</p>
        <p className="text-xs text-muted-foreground tabular-nums">{Math.round(row.accuracy * 100)}% · {row.correctPredictions} correct</p>
      </div>
    </li>
  );
}

export default async function LeaderboardPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();

  const lb = await getGlobalLeaderboard(ctx.tenant.id);

  return (
    <div className="grid gap-5">
      <Link href={`/t/${ctx.tenant.slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {ctx.tenant.displayName}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">All-time community rankings.</p>
      </header>

      {lb.ranked.length === 0 && lb.unranked.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No rankings yet</CardTitle>
            <CardDescription>Rankings appear once events are settled.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {lb.ranked.length > 0 ? (
            <ul className="grid gap-2">
              {lb.ranked.map((r) => (
                <Row key={r.userId} row={r} />
              ))}
            </ul>
          ) : null}

          {lb.unranked.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                Not yet ranked
                <span className="ml-1 font-normal">
                  (fewer than {ctx.settings.minimumRankedPredictions} predictions)
                </span>
              </h2>
              <ul className="grid gap-2">
                {lb.unranked.map((r) => (
                  <Row key={r.userId} row={r} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
