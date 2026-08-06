import Link from "next/link";
import { getPlatformOverview } from "@/lib/ops/admin";
import { HealthBadge } from "@/components/admin/health-badge";

export const dynamic = "force-dynamic";

export default async function AdminTenantsPage() {
  const { tenants } = await getPlatformOverview();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every tenant and its projection health. Select one to operate.</p>
      </header>

      <ul className="flex flex-col gap-2">
        {tenants.map((t) => (
          <li key={t.id}>
            <Link
              href={`/admin/tenants/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.displayName}</span>
                <span className="block truncate text-xs text-muted-foreground">/{t.slug} · {t.status}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {t.health.dead_letter_current} dead · {t.health.stuck} stuck
                </span>
                <HealthBadge state={t.health.state} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
