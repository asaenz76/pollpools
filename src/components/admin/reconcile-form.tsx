"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reconcileTenantAction, type ActionResult } from "@/lib/ops/admin-actions";
import type { ReconciliationScope, ReconciliationMode } from "@/lib/ops/reconciliation";

const SCOPES: ReconciliationScope[] = ["tenant", "user", "event", "settlement", "competition", "creator", "season"];
const MODES: { value: ReconciliationMode; label: string }[] = [
  { value: "dry_run", label: "Dry run (detect drift, write nothing)" },
  { value: "repair", label: "Repair (rebuild from grades)" },
  { value: "requeue", label: "Requeue actionable jobs" },
];

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

/**
 * Run reconciliation for a tenant scope. Purely orchestrates the existing
 * super-admin-gated `reconcile` RPC — no reconciliation logic here. Dry-run detects
 * drift with zero writes; repair rebuilds from authoritative grades; requeue revives
 * actionable jobs. Every run is recorded in reconciliation_runs (audit).
 */
export function ReconcileForm({ tenantId }: { tenantId: string }) {
  const [scope, setScope] = useState<ReconciliationScope>("tenant");
  const [scopeId, setScopeId] = useState("");
  const [mode, setMode] = useState<ReconciliationMode>("dry_run");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const needsScopeId = scope !== "tenant";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        if (needsScopeId && !scopeId.trim()) {
          setResult({ ok: false, message: `A ${scope} id is required for this scope.` });
          return;
        }
        start(async () => {
          try {
            setResult(await reconcileTenantAction(tenantId, scope, needsScopeId ? scopeId.trim() : null, mode));
          } catch {
            setResult({ ok: false, message: "Reconcile failed (not authorized or invalid scope)." });
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Scope</Label>
          <select className={selectClass} value={scope} onChange={(e) => setScope(e.target.value as ReconciliationScope)}>
            {SCOPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Mode</Label>
          <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as ReconciliationMode)}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {needsScopeId ? (
        <div className="flex flex-col gap-1.5">
          <Label>{scope} id</Label>
          <Input value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder={`UUID of the ${scope} to reconcile`} />
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Running…" : "Run reconcile"}</Button>
        {result ? (
          <span className={result.ok ? "text-sm text-muted-foreground" : "text-sm text-negative"} role="status">
            {result.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
