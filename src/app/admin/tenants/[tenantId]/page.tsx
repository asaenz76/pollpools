import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantOps } from "@/lib/ops/admin";
import { HealthBadge } from "@/components/admin/health-badge";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function AdminTenantOpsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ops = await getTenantOps(tenantId);
  if (!ops) notFound();
  const { stats } = ops;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/tenants" className="text-sm text-muted-foreground hover:underline">← Tenants</Link>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ops.displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">/{ops.slug} · projection operations</p>
        </div>
        <HealthBadge state={ops.health.state} />
      </header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Job queue</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <Stat label="Pending" value={stats.pending} />
          <Stat label="Running" value={stats.running} />
          <Stat label="Retrying" value={stats.retrying} />
          <Stat label="Dead-letter" value={stats.dead} />
          <Stat label="Stuck" value={stats.stuck} />
          <Stat label="Succeeded" value={stats.succeeded} />
          <Stat label="Canceled" value={stats.canceled} />
          <Stat label="Oldest pending (s)" value={stats.oldest_pending_seconds} />
        </div>
      </section>

      {Object.keys(stats.by_type).length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Active jobs by type</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {Object.entries(stats.by_type).map(([type, count]) => (
              <li key={type} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="font-mono text-xs">{type}</span>
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.recent_failures.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent failures</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {stats.recent_failures.map((f, i) => (
              <li key={i} className="rounded-md border border-border bg-card px-3 py-2">
                <span className="font-mono text-xs text-negative">{f.job_type}</span>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{f.error}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
