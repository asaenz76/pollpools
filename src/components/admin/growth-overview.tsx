"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setOverrideAction, clearOverrideAction, evaluateTenantNowAction, type ActionResult } from "@/lib/ops/growth-actions";
import type { TenantGrowthRow } from "@/lib/ops/growth-admin";

const METRIC_KEYS = ["audience_growth", "event_consistency", "prediction_participation", "draft_participation", "community_support"] as const;
const bandTone = (b: string | null) =>
  b === "excellent" || b === "healthy" ? "text-positive" : b === "critical" ? "text-negative" : b ? "text-streak" : "text-muted-foreground";

function Row({ row, planKeys }: { row: TenantGrowthRow; planKeys: string[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [overridePlan, setOverridePlan] = useState(planKeys[0] ?? "");
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const run = (fn: () => Promise<ActionResult>) => start(async () => { try { setResult(await fn()); } catch { setResult({ ok: false, message: "Action failed." }); } });

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.displayName}</span>
        <span className="flex items-center gap-2 text-xs">
          <span className="rounded-full border border-primary px-2 py-0.5 text-primary">{row.planName ?? "—"}</span>
          {row.manualOverride ? <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">Manual</span> : null}
          <span className={row.qualification === "at_risk" ? "text-streak" : "text-muted-foreground"}>{row.qualification.replace("_", " ")}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">{row.wau.toLocaleString()} WAU</span>
        <span>
          Health{" "}
          {row.healthScore !== null ? <span className={"font-medium " + bandTone(row.healthBand)}>{row.healthScore} ({row.healthBand})</span> : <span>building</span>}
        </span>
        {METRIC_KEYS.map((k) => (
          <span key={k} className="tabular-nums">{k.split("_")[0]}: {row.components[k] ?? "—"}</span>
        ))}
        <span>{row.draftEnabled ? "draft ✓" : "draft ✗"}</span>
        <span>{row.supportEnabled ? "support ✓" : "support ✗"}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => evaluateTenantNowAction(row.tenantId))}>Evaluate now</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{row.manualOverride ? "Manage override" : "Override"}</Button>
      </div>
      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-2">
          {row.manualOverride ? (
            <div className="flex gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to re-enable automation" />
              <Button size="sm" disabled={pending} onClick={() => run(() => clearOverrideAction(row.tenantId, reason))}>Re-enable auto</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select value={overridePlan} onChange={(e) => setOverridePlan(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-sm">
                {planKeys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" />
              <Button size="sm" disabled={pending} onClick={() => run(() => setOverrideAction(row.tenantId, overridePlan, reason))}>Set override</Button>
            </div>
          )}
        </div>
      ) : null}
      {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " mt-1 text-xs"}>{result.message}</p> : null}
    </div>
  );
}

export function GrowthOverview({ rows, planKeys }: { rows: TenantGrowthRow[]; planKeys: string[] }) {
  const [plan, setPlan] = useState("all");
  const [band, setBand] = useState("all");
  const [flag, setFlag] = useState("all"); // all | at_risk | draft | support

  const filtered = useMemo(() => rows.filter((r) => {
    if (plan !== "all" && r.planKey !== plan) return false;
    if (band !== "all" && r.healthBand !== band) return false;
    if (flag === "at_risk" && r.qualification !== "at_risk") return false;
    if (flag === "draft" && !r.draftEnabled) return false;
    if (flag === "support" && !r.supportEnabled) return false;
    return true;
  }), [rows, plan, band, flag]);

  const sel = "rounded-md border border-border bg-card px-2 py-1 text-sm";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className={sel} aria-label="Filter by plan">
          <option value="all">All plans</option>
          {planKeys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={band} onChange={(e) => setBand(e.target.value)} className={sel} aria-label="Filter by band">
          <option value="all">All bands</option>
          {["excellent", "healthy", "needs_attention", "at_risk", "critical"].map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={flag} onChange={(e) => setFlag(e.target.value)} className={sel} aria-label="Filter">
          <option value="all">Everything</option>
          <option value="at_risk">At Risk (plan)</option>
          <option value="draft">Draft enabled</option>
          <option value="support">Support enabled</option>
        </select>
        <span className="self-center text-xs text-muted-foreground">{filtered.length} tenant(s)</span>
      </div>
      {filtered.map((r) => <Row key={r.tenantId} row={r} planKeys={planKeys} />)}
    </div>
  );
}
