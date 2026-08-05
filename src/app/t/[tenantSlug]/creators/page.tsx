import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { listCreators } from "@/features/social/get-creators";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const creators = await listCreators(ctx.tenant.id);

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
        <p className="mt-1 text-sm text-muted-foreground">Follow creators to get their new events.</p>
      </header>

      {creators.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No creators yet</CardTitle>
            <CardDescription>Verified creators will appear here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {creators.map((c) => (
            <li key={c.id}>
              <Link href={`/t/${ctx.tenant.slug}/creators/${c.slug}`} className="block">
                <Card className="transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle className="text-base">{c.displayName}</CardTitle>
                    <CardDescription>
                      {c.followers} {c.followers === 1 ? "follower" : "followers"}
                      {c.description ? ` · ${c.description}` : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
