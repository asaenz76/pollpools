import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getFeed } from "@/features/social/get-feed";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default async function FeedPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const items = await getFeed(ctx.tenant.id, ctx.tenant.slug);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">What&apos;s happening in {ctx.tenant.displayName}.</p>
      </header>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
            <CardDescription>Predictions, results, and achievements will show up here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const inner = (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-3">
                <span className="min-w-0 text-sm">{it.text}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timeAgo(it.createdAt)}</span>
              </div>
            );
            return <li key={it.id}>{it.href ? <Link href={it.href} className="block hover:opacity-90">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
