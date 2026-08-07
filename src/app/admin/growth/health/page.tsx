import Link from "next/link";
import { requireSuperAdmin } from "@/lib/ops/admin";
import { getHealthMetricsConfig, getWauConfig } from "@/lib/ops/growth-admin";
import { HealthConfig } from "@/components/admin/health-config";

export const dynamic = "force-dynamic";

export default async function AdminHealthConfigPage() {
  await requireSuperAdmin();
  const [metrics, wau] = await Promise.all([getHealthMetricsConfig(), getWauConfig()]);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/growth" className="text-sm text-muted-foreground hover:underline">← Growth &amp; Health</Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Community Health configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Coaching only — never affects Revenue Plans. Editing bumps the formula version; historical snapshots are preserved.</p>
      </header>
      <HealthConfig metrics={metrics} wau={wau} />
    </div>
  );
}
