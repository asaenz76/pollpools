# Revenue Plans (Phase 8-B.5 GRE.1 / GRE.3)

Revenue Plans are **progression levels** that set a tenant's revenue share per
source. They are distinct from Subscription Plans (which control features).

Seeded ladder (example config; Super-Admin editable, nothing hard-coded):
Starter → Momentum → Champion → Legend → Enterprise (manual).

## Data model

- `revenue_plans` — key, display_name, tier, status (active/manual/retired),
  is_default, `qualification` jsonb, `feature_eligibility`, grace_period_days.
- `revenue_plan_shares` — per `billing_product_type` creator/platform basis points
  (sum 10000). `platform_premium` is excluded by a check constraint — Platform
  Support is never shareable.
- `tenant_revenue_plan_assignments` — **immutable** history; the current plan is the
  row with `ended_at is null`. `assign_revenue_plan` closes + inserts (never rewrites).
- `tenant_plan_state` — mutable qualification state (qualified/at_risk, grace,
  manual override, last WAU).

## Qualification (explicit, transparent)

`qualification` = `{ min_wau, remain_wau, min_account_age_days, require_verification,
require_good_standing }`. `remain_wau < min_wau` gives anti-flapping **hysteresis**
(enter high, remain lower). Community Health is **never** a qualification input.

## Automatic upgrade / downgrade

`evaluate_tenant_plan` (scheduled via `/api/internal/growth/evaluate`, daily):

- **Upgrade** — immediately to the highest active plan above the current tier whose
  ENTER threshold is met.
- **At Risk → grace** — if below the current plan's REMAIN threshold, enter At Risk
  for `grace_period_days`. Recovery within grace → no change.
- **Downgrade** — only when grace expires, to the highest active plan whose REMAIN is
  met (else the default).
- **Manual override** (`set_plan_override`, reason required, audited) suspends
  automation; `clear_plan_override` resumes it.

## Revenue split & immutable earnings

`app.resolve_revenue_split` reads the tenant's current plan share as a tier above the
tenant default. Earnings record their split at earn time, so **plan changes affect
future transactions only** — historical earnings are never recomputed.

## Transparency

Tenants see the shares for the sources they participate in (Creator Support,
Competitor Draft, …) — visible, not editable. Platform Support is never shown.
