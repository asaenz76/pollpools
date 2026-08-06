"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { drainTenantAction, runMonitorAction, requeueTenantAction, type ActionResult } from "@/lib/ops/admin-actions";

/**
 * Operator action buttons for a tenant: drain the queue, run the projection
 * monitor, or requeue actionable (stuck / current dead-letter) jobs. Each triggers
 * the existing service-role ops function via a super-admin-gated server action.
 */
export function OpsActions({ tenantId }: { tenantId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult({ ok: false, message: "Action failed." });
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => drainTenantAction(tenantId))}>
          {pending ? "Working…" : "Drain now"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => runMonitorAction(tenantId))}>
          Run monitor
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => requeueTenantAction(tenantId))}>
          Requeue actionable
        </Button>
      </div>
      {result ? (
        <p className={result.ok ? "text-sm text-muted-foreground" : "text-sm text-negative"} role="status">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
