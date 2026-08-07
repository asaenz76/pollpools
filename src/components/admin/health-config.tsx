"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateHealthMetricAction, updateWauConfigAction, type ActionResult } from "@/lib/ops/growth-actions";
import type { HealthMetricConfig, WauConfig } from "@/lib/ops/growth-admin";

const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

function MetricRow({ metric }: { metric: HealthMetricConfig }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [enabled, setEnabled] = useState(metric.enabled);
  const [weight, setWeight] = useState(String(metric.weight));
  const [maxScore, setMaxScore] = useState(String(metric.maxScore));
  const [target, setTarget] = useState(String(metric.target));
  const [window, setWindow] = useState(String(metric.measurementWindowDays));
  const run = (fn: () => Promise<ActionResult>) => start(async () => { try { setResult(await fn()); } catch { setResult({ ok: false, message: "Action failed." }); } });

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">{metric.displayName}</span>
        {metric.requiresFeature ? <span className="text-xs text-muted-foreground">requires {metric.requiresFeature}</span> : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="flex flex-col text-xs text-muted-foreground">Weight<Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
        <label className="flex flex-col text-xs text-muted-foreground">Max score<Input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} /></label>
        <label className="flex flex-col text-xs text-muted-foreground">Target %<Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="flex flex-col text-xs text-muted-foreground">Window (d)<Input type="number" value={window} onChange={(e) => setWindow(e.target.value)} /></label>
        <label className="flex items-center gap-2 self-end text-xs text-muted-foreground"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Enabled</label>
      </div>
      <div className="mt-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => updateHealthMetricAction(metric.key, { enabled, weight: num(weight), maxScore: num(maxScore), target: num(target), windowDays: num(window) }))}>Save</Button>
      </div>
      {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " mt-1 text-xs"}>{result.message}</p> : null}
    </div>
  );
}

export function HealthConfig({ metrics, wau }: { metrics: HealthMetricConfig[]; wau: WauConfig }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [w, setW] = useState({ ...wau });
  const run = (fn: () => Promise<ActionResult>) => start(async () => { try { setResult(await fn()); } catch { setResult({ ok: false, message: "Action failed." }); } });

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Community Health metrics</h2>
        <p className="mb-2 text-xs text-muted-foreground">Editing a metric bumps the formula version; historical snapshots are never rewritten.</p>
        <div className="flex flex-col gap-2">{metrics.map((m) => <MetricRow key={m.key} metric={m} />)}</div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">WAU definition</h2>
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="flex flex-col text-xs text-muted-foreground">Window (days)<Input type="number" value={String(w.windowDays)} onChange={(e) => setW({ ...w, windowDays: num(e.target.value) })} /></label>
            <label className="flex flex-col text-xs text-muted-foreground">Min actions<Input type="number" value={String(w.minActions)} onChange={(e) => setW({ ...w, minActions: num(e.target.value) })} /></label>
            <label className="flex flex-col text-xs text-muted-foreground">Benchmark min tenants<Input type="number" value={String(w.benchmarkMinTenants)} onChange={(e) => setW({ ...w, benchmarkMinTenants: num(e.target.value) })} /></label>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-2"><input type="checkbox" checked={w.signalPrediction} onChange={(e) => setW({ ...w, signalPrediction: e.target.checked })} />Prediction</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={w.signalDraft} onChange={(e) => setW({ ...w, signalDraft: e.target.checked })} />Draft</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={w.signalLogin} onChange={(e) => setW({ ...w, signalLogin: e.target.checked })} />Login</label>
          </div>
          <div className="mt-2"><Button size="sm" disabled={pending} onClick={() => run(() => updateWauConfigAction(w))}>Save WAU definition</Button></div>
          {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " mt-1 text-xs"}>{result.message}</p> : null}
        </div>
      </section>
    </div>
  );
}
