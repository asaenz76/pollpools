import Link from "next/link";
import { getPlatformOverview } from "@/lib/ops/admin";
import { HealthBadge } from "@/components/admin/health-badge";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          "mt-1 text-2xl font-semibold tabular-nums " +
          (value > 0 && tone === "bad" ? "text-negative" : value > 0 && tone === "warn" ? "text-streak" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const { tenants, totals } = await getPlatformOverview();
  const unhealthy = tenants.filter((t) => t.health.state !== "healthy");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Operations overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Projection health across every tenant on the platform.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tenants" value={totals.tenants} />
        <Stat label="Unhealthy" value={totals.unhealthy} tone="bad" />
        <Stat label="Dead-letters (current)" value={totals.deadLetterCurrent} tone="bad" />
        <Stat label="Stuck jobs" value={totals.stuck} tone="warn" />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          {unhealthy.length > 0 ? "Needs attention" : "All tenants healthy"}
        </h2>
        {unhealthy.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            No dead-letters, stuck jobs, or blocked projections across {totals.tenants} tenants.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {unhealthy.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/admin/tenants/${t.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t.health.dead_letter_current} dead · {t.health.stuck} stuck · {t.health.retrying_current} retrying
                    </span>
                  </span>
                  <HealthBadge state={t.health.state} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm">
        <Link href="/admin/tenants" className="text-primary hover:underline">
          View all tenants →
        </Link>
      </p>
    </div>
  );
}
