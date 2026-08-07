# Community Health (Phase 8-B.5 GRE.4)

Community Health is a **coaching** system. It helps a tenant understand what's
working, what's weakening, and what to improve next. It is deterministic (no AI/ML),
fully explainable, and **never** determines Revenue Plans, billing, percentages, or
qualification.

## Scored metrics (peers)

Five metrics a tenant can meaningfully **improve** through their own actions — no
vanity/accumulated totals:

1. **Audience Growth** — WAU trend vs the previous period.
2. **Event Consistency** — share of recent weeks with ≥1 event.
3. **Prediction Participation** — share of WAU making ≥1 prediction. *Excludes draft.*
4. **Draft Participation** — share of active users in Competitor Draft. *Excludes
   predictions.* An independent **peer** of Prediction Participation — never blended.
5. **Community Support** — share of active users who support the tenant
   (`creator_supporter` only; **Platform Support is never counted**).

## Platform Status is separate and UNSCORED

Operational readiness (custom domain, billing, payout, jobs, reconciliation,
notifications, SSL) is shown as its own checklist. It is **not** part of the score and
does not affect Community Health or Revenue Plans. It reuses `getProjectionHealth`
(no parallel health engine).

## Scoring (deterministic)

Each enabled + applicable metric scores `clamp(max * value / target)`. The overall is
the weight-normalized sum over **enabled + applicable** metrics, always 0–100:

```
overall = round( 100 * Σ(weight_i · score_i/max_i) / Σ(weight_i) )
```

- **Disabled / inapplicable** (draft off, support off) → excluded, not zeroed; the
  remaining weights normalize back to 100 (no penalty for unused features).
- **Building baseline** — a feature enabled with no history yet, or a too-new tenant,
  shows "Building baseline", never a misleading 0.

Configurable score **bands** (Excellent / Healthy / Needs Attention / At Risk /
Critical) are Super-Admin editable and never tied to Revenue Plans.

## Benchmarks

Anonymous per-metric platform **median / top-10%**, surfaced only once
`health_benchmark_min_tenants` have data. Never exposes a tenant identity or exact
metric; hidden ("Not enough platform data yet") when insufficient.

## History & formula versioning

`community_health_snapshots` stores one immutable daily snapshot per tenant with
component scores + raw values + `formula_version`. Editing metric/band config bumps
the version; **old snapshots are never rewritten**, so historical scores stay
explainable.

## Configuration

`community_health_metrics` (enabled, weight, max_score, `scoring.target`, window,
`requires_feature`, suggestion, order) and `community_health_bands` — Super-Admin
only. Tenants can view the metric, weight, value, score, calculation, and trend, but
cannot alter the formula.

## Suggestions

Deterministic, config-driven, tied to the weakest metric. Never AI, never
"raise prices", never "manipulate a metric".
