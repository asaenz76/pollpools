import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getEntitlements, getPremiumProduct, formatMoney } from "@/features/billing/get-billing";
import { CheckoutButton } from "@/components/billing/buttons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const BENEFITS = ["Advanced analytics", "Complete prediction history", "Extended statistics & filters", "Premium profile themes", "Ad-free experience"];

export default async function PremiumPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!ctx.features.isEnabled("platform_premium_enabled")) notFound();

  const user = await getSessionUser();
  const [{ premium }, product] = await Promise.all([getEntitlements(ctx.tenant.id), getPremiumProduct(ctx.tenant.id)]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx.tenant.displayName} Premium</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upgrade your experience with advanced analytics, extended history, and premium profile features. Free Open
          Predictions always stay free.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s included</CardTitle>
          <CardDescription>Premium never affects prediction points, accuracy, or settlement.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1.5 text-sm">
            {BENEFITS.map((b) => (
              <li key={b} className="text-muted-foreground">• {b}</li>
            ))}
          </ul>
          <div className="pt-2">
            {premium ? (
              <p className="text-sm font-medium text-positive">You&apos;re a Premium member.</p>
            ) : !user ? (
              <Link href={`/t/${ctx.tenant.slug}/sign-in`} className={buttonVariants({ variant: "primary" })}>Sign in to upgrade</Link>
            ) : product ? (
              <CheckoutButton productId={product.id} tenantSlug={ctx.tenant.slug} label={`Upgrade — ${formatMoney(product.priceMinorUnits, product.currencyCode)}/${product.interval === "yearly" ? "yr" : "mo"}`} />
            ) : (
              <p className="text-sm text-muted-foreground">Premium isn&apos;t available here yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Link href={`/t/${ctx.tenant.slug}/billing`} className="text-sm text-primary hover:underline">Manage billing →</Link>
    </div>
  );
}
