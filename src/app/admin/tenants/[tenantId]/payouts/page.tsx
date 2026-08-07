import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantOps, getPayoutRequests } from "@/lib/ops/admin";
import { PayoutOps } from "@/components/admin/payout-ops";

export const dynamic = "force-dynamic";

export default async function PayoutsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ops = await getTenantOps(tenantId);
  if (!ops) notFound();
  const requests = await getPayoutRequests(tenantId);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/tenants/${tenantId}`} className="text-sm text-muted-foreground hover:underline">← {ops.displayName} ops</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creator payout requests for {ops.displayName}. Approve reserves available earnings; mark paid records the
          external reference. Amounts are validated at request time — never edited here.
        </p>
      </header>
      <PayoutOps tenantId={tenantId} requests={requests} />
    </div>
  );
}
