"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verificationRecordName, verificationTxtValue } from "@/lib/domain/domains";
import {
  addTenantDomainAction,
  verifyTenantDomainAction,
  makeTenantDomainPrimaryAction,
  removeTenantDomainAction,
  type DomainActionResult,
} from "@/lib/ops/domain-actions";
import type { TenantDomain } from "@/lib/ops/admin";

const statusColor = (s: string) =>
  s === "verified" ? "text-positive" : s === "failed" ? "text-negative" : s === "disabled" ? "text-muted-foreground" : "text-streak";

function DomainRow({ tenantId, domain }: { tenantId: string; domain: TenantDomain }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DomainActionResult | null>(null);

  const run = (fn: () => Promise<DomainActionResult>) =>
    start(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult({ ok: false, message: "Action failed." });
      }
    });

  const unverified = domain.verificationStatus !== "verified";

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{domain.domain}</span>
            {domain.isPrimary ? (
              <span className="rounded-full border border-primary px-2 py-0.5 text-[10px] font-medium text-primary">Primary</span>
            ) : null}
          </span>
          <span className="block text-xs text-muted-foreground">
            {domain.domainType.replace(/_/g, " ")} · SSL {domain.sslStatus}
          </span>
        </span>
        <span className={"text-xs font-medium capitalize " + statusColor(domain.verificationStatus)}>
          {domain.verificationStatus}
        </span>
      </div>

      {unverified && domain.verificationToken ? (
        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
          <p className="mb-1 text-muted-foreground">Add this DNS TXT record, then verify:</p>
          <code className="block break-all font-mono">
            {verificationRecordName(domain.domain)} TXT &quot;{verificationTxtValue(domain.verificationToken)}&quot;
          </code>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        {unverified ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => verifyTenantDomainAction(tenantId, domain.id))}>
            Verify
          </Button>
        ) : null}
        {!domain.isPrimary && !unverified ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => makeTenantDomainPrimaryAction(tenantId, domain.id))}>
            Make primary
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => removeTenantDomainAction(tenantId, domain.id))}>
          Remove
        </Button>
      </div>

      {result ? (
        <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " mt-2 break-words text-sm"} role="status">
          {result.message}
        </p>
      ) : null}
    </li>
  );
}

export function DomainManager({ tenantId, domains }: { tenantId: string; domains: TenantDomain[] }) {
  const [hostname, setHostname] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DomainActionResult | null>(null);

  const add = () =>
    start(async () => {
      try {
        const r = await addTenantDomainAction(tenantId, hostname);
        setResult(r);
        if (r.ok) setHostname("");
      } catch {
        setResult({ ok: false, message: "Couldn't add the domain." });
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="predict.example.com"
            aria-label="Custom domain"
          />
          <Button disabled={pending || !hostname.trim()} onClick={add}>
            Add domain
          </Button>
        </div>
        {result ? (
          <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " break-words text-sm"} role="status">
            {result.message}
          </p>
        ) : null}
      </div>

      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">No custom domains yet. The tenant is reachable at its platform subdomain.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {domains.map((d) => (
            <DomainRow key={d.id} tenantId={tenantId} domain={d} />
          ))}
        </ul>
      )}
    </div>
  );
}
