"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePlanShareAction, updatePlanConfigAction, retirePlanAction, type ActionResult } from "@/lib/ops/growth-actions";
import type { RevenuePlan } from "@/lib/growth/revenue-plans";

const SOURCE_LABEL: Record<string, string> = { creator_support: "Creator Support", paid_competitor_draft: "Competitor Draft" };

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function PlanCard({ plan }: { plan: RevenuePlan }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const q = plan.qualification as Record<string, number | boolean>;
  const [minWau, setMinWau] = useState(String(num(q.min_wau)));
  const [remainWau, setRemainWau] = useState(String(num(q.remain_wau)));
  const [ageDays, setAgeDays] = useState(String(num(q.min_account_age_days)));
  const [grace, setGrace] = useState(String(plan.gracePeriodDays));
  const [verify, setVerify] = useState(Boolean(q.require_verification));
  const [enabled, setEnabled] = useState(plan.status === "active");
  const [shares, setShares] = useState<Record<string, string>>(
    Object.fromEntries(plan.shares.filter((s) => s.productType !== "platform_premium").map((s) => [s.productType, String(Math.round(s.creatorShareBps / 100))])),
  );
  const run = (fn: () => Promise<ActionResult>) => start(async () => { try { setResult(await fn()); } catch { setResult({ ok: false, message: "Action failed." }); } });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{plan.displayName} <span className="text-xs text-muted-foreground">tier {plan.tier} · {plan.status}</span></h3>
        {!plan.isDefault ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => retirePlanAction(plan.key))}>Retire</Button> : null}
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">Revenue shares (creator %)</p>
      <div className="mt-1 flex flex-col gap-2">
        {plan.shares.filter((s) => s.productType !== "platform_premium").map((sh) => (
          <div key={sh.productType} className="flex items-center gap-2 text-sm">
            <span className="w-32">{SOURCE_LABEL[sh.productType] ?? sh.productType}</span>
            <Input type="number" value={shares[sh.productType] ?? ""} onChange={(e) => setShares((s) => ({ ...s, [sh.productType]: e.target.value }))} className="w-24" />
            <span className="text-xs text-muted-foreground">% creator · {100 - num(shares[sh.productType])}% platform</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updatePlanShareAction(plan.key, sh.productType, num(shares[sh.productType])))}>Save</Button>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">Qualification</p>
      <div className="mt-1 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <label className="flex flex-col text-xs text-muted-foreground">Enter WAU<Input type="number" value={minWau} onChange={(e) => setMinWau(e.target.value)} /></label>
        <label className="flex flex-col text-xs text-muted-foreground">Remain WAU<Input type="number" value={remainWau} onChange={(e) => setRemainWau(e.target.value)} /></label>
        <label className="flex flex-col text-xs text-muted-foreground">Grace (days)<Input type="number" value={grace} onChange={(e) => setGrace(e.target.value)} /></label>
        <label className="flex flex-col text-xs text-muted-foreground">Min age (days)<Input type="number" value={ageDays} onChange={(e) => setAgeDays(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />Require verification</label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enabled (automatic)</label>
      </div>
      <div className="mt-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => updatePlanConfigAction(plan.key, {
          minWau: num(minWau), remainWau: num(remainWau), minAccountAgeDays: num(ageDays), requireVerification: verify, gracePeriodDays: num(grace), enabled,
        }))}>Save qualification</Button>
      </div>
      {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " mt-2 text-xs"}>{result.message}</p> : null}
    </div>
  );
}

export function PlanConfig({ plans }: { plans: RevenuePlan[] }) {
  return (
    <div className="flex flex-col gap-3">
      {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
    </div>
  );
}
