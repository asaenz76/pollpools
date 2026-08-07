# Commercial Architecture (Phase 8-B.5)

Prediction Engine's commercial layer rewards tenants for growing their communities.
It is built entirely on top of the existing billing, immutable earnings ledger,
configuration engine, admin system, notifications, and provider architecture — it
is **not** a billing, settlement, or prediction rewrite.

```
Platform Owner → Revenue Plans → Tenant → Revenue Sources → Billing → Immutable Earnings
```

## Two independent systems

| | Revenue Plans | Community Health |
| --- | --- | --- |
| Purpose | **Economics** — the revenue share per source | **Coaching** — engagement guidance |
| Drives | Upgrades / downgrades / percentages | Nothing commercial |
| Inputs | Explicit qualification (WAU, age, standing, verification) | Component metrics |
| Editable by | Super Admin only | Super Admin only (formula) |

**Community Health never determines Revenue Plan assignment.** There is no
`community_health_score >= X` qualification rule anywhere.

## Four business rules (enforced)

1. Revenue Plans control economics; Community Health coaches growth — independent.
2. Revenue percentages are visible to tenants but editable only by the Super Admin.
3. Plan changes affect **future** transactions only; historical earnings never change
   (the split is recorded on each `creator_earnings` row at earn time).
4. **Platform Support** (`platform_premium`) is always 100% platform revenue, never
   participates in tenant revenue sharing, and is **platform-private** — invisible to
   tenants in every surface (dashboard, shares, Community Support, exports, APIs,
   notifications). It creates no tenant earnings. Visible to Super Admin only.

## A creator IS a tenant

There is no separate creator commercial model. Revenue Plans are assigned to the
tenant; the per-creator earnings ledger records who within the tenant earned.

## Where it plugs in

`app.resolve_revenue_split` resolves the split as: per-creator rule → **tenant plan
share** → tenant default → platform floor. Nothing else in billing changed.

See [revenue-plans.md](revenue-plans.md), [growth-engine.md](growth-engine.md),
[community-health.md](community-health.md), [tenant-success-timeline.md](tenant-success-timeline.md).
