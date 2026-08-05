import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getMyCreator } from "@/features/creator/get-creator-workspace";
import { getCreatorRevenue, formatMoney } from "@/features/billing/get-billing";
import { RequestPayoutButton } from "@/components/billing/buttons";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function CreatorRevenuePage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  if (!(await getSessionUser())) redirect(`/t/${ctx.tenant.slug}/sign-in`);
  const creator = await getMyCreator(ctx.tenant.id);
  if (!creator) redirect(`/t/${ctx.tenant.slug}/creator`);

  const rev = await getCreatorRevenue(ctx.tenant.id, creator.id);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/t/${ctx.tenant.slug}/creator`} className="text-sm text-muted-foreground hover:underline">← Creator Studio</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your creator-support earnings. Payouts are reviewed and paid manually.</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Available" value={formatMoney(rev.availableMinorUnits, rev.currencyCode)} />
        <Stat label="Pending" value={formatMoney(rev.pendingMinorUnits, rev.currencyCode)} />
        <Stat label="Paid" value={formatMoney(rev.paidMinorUnits, rev.currencyCode)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request a payout</CardTitle>
          <CardDescription>Only available earnings can be paid out. Earnings become available once payment is verified.</CardDescription>
        </CardHeader>
        <div className="p-5 pt-0">
          <RequestPayoutButton creatorId={creator.id} availableMinorUnits={rev.availableMinorUnits} currencyCode={rev.currencyCode} />
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Payout history</h2>
        {rev.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payout requests yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rev.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
                <span>{formatMoney(p.amountMinorUnits, p.currencyCode)}</span>
                <span className="text-xs text-muted-foreground">{p.status} · {new Date(p.requestedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
