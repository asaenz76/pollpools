import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getCreatorProfile } from "@/features/social/get-creators";
import { getCreatorSupportProduct, getEntitlements, formatMoney } from "@/features/billing/get-billing";
import { FollowButton } from "@/components/domain/follow-button";
import { CheckoutButton } from "@/components/billing/buttons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CreatorProfilePage({ params }: { params: Promise<{ creatorSlug: string }> }) {
  const { creatorSlug } = await params;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  const creator = await getCreatorProfile(ctx.tenant.id, creatorSlug, user?.id ?? null);
  if (!creator) notFound();

  const canFollow = ctx.features.isEnabled("creator_following_enabled");
  const supportEnabled = ctx.features.isEnabled("creator_support_enabled");
  const [supportProduct, entitlements] = await Promise.all([
    supportEnabled ? getCreatorSupportProduct(ctx.tenant.id, creator.id) : Promise.resolve(null),
    getEntitlements(ctx.tenant.id),
  ]);
  const isSupporter = entitlements.supportedCreatorIds.includes(creator.id);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creators`} className="text-sm text-muted-foreground hover:underline">
        ← Creators
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{creator.displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {creator.followers} {creator.followers === 1 ? "follower" : "followers"}
          </p>
          {creator.description ? <p className="mt-2 text-sm text-muted-foreground">{creator.description}</p> : null}
        </div>
        {canFollow ? (
          <FollowButton
            creatorId={creator.id}
            initialFollowing={creator.isFollowing}
            signedIn={Boolean(user)}
            signInHref={`/t/${ctx.tenant.slug}/sign-in`}
          />
        ) : null}
      </header>

      {supportEnabled && supportProduct ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Support {creator.displayName}</CardTitle>
            <CardDescription>
              {isSupporter
                ? "You're a supporter. Thank you!"
                : "Support does not affect prediction or draft scoring, or unlock any advantage."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSupporter ? (
              <span className="rounded-full border border-positive/40 px-3 py-1 text-xs text-positive">Supporter</span>
            ) : user ? (
              <CheckoutButton
                productId={supportProduct.id}
                tenantSlug={ctx.tenant.slug}
                creatorId={creator.id}
                variant="outline"
                label={`Support — ${formatMoney(supportProduct.priceMinorUnits, supportProduct.currencyCode)}/mo`}
              />
            ) : (
              <Link href={`/t/${ctx.tenant.slug}/sign-in`} className="text-sm text-primary hover:underline">Sign in to support</Link>
            )}
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="creator-events">
        <h2 id="creator-events" className="mb-3 text-sm font-medium text-muted-foreground">
          Events
        </h2>
        {creator.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {creator.events.map((e) => (
              <li key={e.id}>
                <Link href={`/t/${ctx.tenant.slug}/e/${e.slug}`} className="block">
                  <Card className="transition-colors hover:bg-muted">
                    <CardHeader>
                      <CardTitle className="text-base">{e.title}</CardTitle>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
