import Link from "next/link";
import { requireSuperAdmin } from "@/lib/ops/admin";
import { getAllTenantGrowth } from "@/lib/ops/growth-admin";
import { getRevenuePlans } from "@/lib/growth/revenue-plans";
import { GrowthOverview } from "@/components/admin/growth-overview";

export const dynamic = "force-dynamic";

export default async function AdminGrowthPage() {
  await requireSuperAdmin();
  const [rows, plans] = await Promise.all([getAllTenantGrowth(), getRevenuePlans()]);
  const planKeys = plans.filter((p) => p.status !== "retired").map((p) => p.key);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Growth &amp; Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">All tenants: Revenue Plan, WAU, and Community Health at a glance.</p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/growth/plans" className="text-primary hover:underline">Revenue Plans →</Link>
          <Link href="/admin/growth/health" className="text-primary hover:underline">Health config →</Link>
        </div>
      </header>
      <GrowthOverview rows={rows} planKeys={planKeys} />
    </div>
  );
}
