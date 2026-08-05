import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getBillingOverview, formatMoney } from "@/features/billing/get-billing";
import { CancelSubscriptionButton } from "@/components/billing/buttons";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const overview = await getBillingOverview(ctx.tenant.id);
  if (!overview) redirect(`/t/${ctx.tenant.slug}/sign-in`);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your subscriptions and orders.</p>
      </header>

      {status === "success" ? (
        <div className="rounded-md border border-primary/40 bg-muted/40 px-3 py-2 text-sm">Payment received. We&apos;re confirming your access — this page updates once verified.</div>
      ) : status === "pending" ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Checkout in progress. Access is confirmed after payment is verified.</div>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Subscriptions</h2>
        {overview.subscriptions.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No active subscriptions</CardTitle>
              <CardDescription>
                Explore <Link href={`/t/${ctx.tenant.slug}/premium`} className="text-primary hover:underline">Premium</Link> or support a creator.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.subscriptions.map((sub) => (
              <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sub.kind === "support" ? `Supporting ${sub.creatorName ?? "a creator"}` : "Platform Premium"}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className={cn(sub.status === "active" ? "text-positive" : sub.status === "past_due" ? "text-negative" : "")}>{sub.status}</span>
                    {sub.currentPeriodEnd ? ` · ${sub.cancelAtPeriodEnd ? "ends" : "renews"} ${new Date(sub.currentPeriodEnd).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {sub.status === "active" && !sub.cancelAtPeriodEnd ? <CancelSubscriptionButton subscriptionId={sub.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent orders</h2>
        {overview.orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{o.description}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatMoney(o.totalMinorUnits, o.currencyCode)} · <span className={cn(o.status === "refunded" && "text-negative")}>{o.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
