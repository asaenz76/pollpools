import Link from "next/link";
import { requireSuperAdmin } from "@/lib/ops/admin";
import { getRevenuePlans } from "@/lib/growth/revenue-plans";
import { PlanConfig } from "@/components/admin/plan-config";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  await requireSuperAdmin();
  const plans = await getRevenuePlans();
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/growth" className="text-sm text-muted-foreground hover:underline">← Growth &amp; Health</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Revenue Plans</h1>
        <p className="mt-1 text-sm text-muted-foreground">Economics only. Tenant share + platform share always total 100%. Platform Support is never shareable. Changes are audited.</p>
      </header>
      <PlanConfig plans={plans} />
    </div>
  );
}
