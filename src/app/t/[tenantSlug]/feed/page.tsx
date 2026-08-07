import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getFeed } from "@/features/social/get-feed";
import { FeedList } from "@/components/social/feed-list";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const { items, nextCursor } = await getFeed(ctx.tenant.id, ctx.tenant.slug);

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
        <FeedList tenantSlug={ctx.tenant.slug} initialItems={items} initialCursor={nextCursor} />
      )}
    </div>
  );
}
