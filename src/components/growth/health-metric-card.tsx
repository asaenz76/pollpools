"use client";

import { useState } from "react";
import type { HealthComponent } from "@/lib/growth/community-health";
import type { Benchmark } from "@/lib/growth/community-health";

const CALC_EXPLANATION: Record<string, string> = {
  audience_growth: "How your Weekly Active Users are trending versus the previous period. Growth raises the score; decline lowers it.",
  event_consistency: "The share of recent weeks in which you published at least one event.",
  prediction_participation: "The share of Weekly Active Users who made at least one prediction. Draft activity is not counted here.",
  draft_participation: "The share of active users who took part in your Competitor Draft. Ordinary predictions are not counted here.",
  community_support: "The share of active users who voluntarily support you.",
};

function toneForFraction(f: number): string {
  if (f >= 0.75) return "text-positive";
  if (f >= 0.5) return "text-streak";
  return "text-negative";
}

/**
 * A single Community Health metric card. Clicking expands the coaching detail
 * (Rule 6): value, score, trend, benchmark, period, calculation, target,
 * deterministic suggestion. Draft Participation renders here exactly like any
 * other peer metric — never inside Prediction Participation.
 */
export function HealthMetricCard({ metric, benchmark }: { metric: HealthComponent; benchmark?: Benchmark }) {
  const [open, setOpen] = useState(false);
  const changePct = typeof metric.extra?.change_pct === "number" ? (metric.extra.change_pct as number) : null;

  // Inapplicable / building states never show a zero.
  if (!metric.applicable) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 opacity-70">
        <p className="text-sm font-medium">{metric.displayName}</p>
        <p className="mt-1 text-xs text-muted-foreground">Not applicable — this feature is off, so it doesn&apos;t affect your score.</p>
      </div>
    );
  }
  if (metric.building) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">{metric.displayName}</p>
        <p className="mt-1 text-lg font-semibold text-muted-foreground">Building baseline</p>
        <p className="text-xs text-muted-foreground">We&apos;ll start scoring this once there&apos;s enough activity.</p>
      </div>
    );
  }

  const fraction = metric.score !== null ? metric.score / metric.maxScore : 0;

  return (
    <div className="rounded-xl border border-border bg-card transition-colors hover:border-border-strong">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-col gap-1 p-4 text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{metric.displayName}</span>
          <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{Math.round(metric.value)}%</span>
          <span className={"text-sm font-medium tabular-nums " + toneForFraction(fraction)}>
            {metric.score} / {metric.maxScore}
          </span>
        </div>
        {changePct !== null ? (
          <span className={"text-xs " + (changePct >= 0 ? "text-positive" : "text-negative")}>
            {changePct >= 0 ? "↑" : "↓"} {Math.abs(changePct)}% vs previous
          </span>
        ) : null}
        {/* progress bar */}
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
      </button>

      {open ? (
        <div className="border-t border-border px-4 py-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">Current value</dt>
              <dd className="font-medium tabular-nums">{Math.round(metric.value)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Score</dt>
              <dd className="font-medium tabular-nums">{metric.score} / {metric.maxScore}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Target</dt>
              <dd className="font-medium tabular-nums">{metric.target}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Measurement period</dt>
              <dd className="font-medium">{metric.windowDays} days</dd>
            </div>
            {benchmark ? (
              <>
                <div>
                  <dt className="text-xs text-muted-foreground">Platform median</dt>
                  <dd className="font-medium tabular-nums">{benchmark.median}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Top 10%</dt>
                  <dd className="font-medium tabular-nums">{benchmark.top10}%</dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">How this is calculated: </span>
            {CALC_EXPLANATION[metric.key] ?? "Based on your community's activity during the measurement period."}
          </p>
          {metric.suggestion ? (
            <p className="mt-2 rounded-md bg-primary-subtle px-3 py-2 text-xs text-foreground">
              <span className="font-medium">Suggestion: </span>
              {metric.suggestion}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
