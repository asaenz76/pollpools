import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantOps, getTenantDomains } from "@/lib/ops/admin";
import { DomainManager } from "@/components/admin/domain-manager";

export const dynamic = "force-dynamic";

export default async function DomainsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ops = await getTenantOps(tenantId);
  if (!ops) notFound();
  const domains = await getTenantDomains(tenantId);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/tenants/${tenantId}`} className="text-sm text-muted-foreground hover:underline">
        ← {ops.displayName} ops
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Custom domains</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Map custom domains to {ops.displayName}. Ownership is verified via DNS TXT before a domain resolves; exactly one
          domain is primary and other verified domains redirect to it. SSL is provisioned by the hosting platform.
        </p>
      </header>
      <DomainManager tenantId={tenantId} domains={domains} />
    </div>
  );
}
