# Configuration Engine

Prediction Engine has no single "settings blob" and no generic configuration DSL.
Instead it resolves configuration in **tiers**, most specific first, over typed
structures that already exist. The Configuration Engine is that resolution model
plus the platform-default tier that backs it.

## Resolution tiers

```
record rule  →  tenant setting / flag  →  platform default
(most specific)                            (fallback)
```

| Tier | Where it lives | Example |
| --- | --- | --- |
| **Record rule** | per-row tables | `creator_revenue_rules` (a creator's split), `scoring_rules` (a tenant/competition scoring rule), `billing_products` (a product's price) |
| **Tenant setting / flag** | `tenant_settings` (typed columns + `settings` JSONB), `tenant_feature_flags` (via `FeatureFlagService`), `tenants.theme` | sentiment visibility, revenue split, enabled features, branding |
| **Platform default** | `platform_config` (single row) | default revenue split; future platform-wide defaults |

Each tier is optional; resolution falls through to the next. This is why a tenant
needs **no migration and no config file** to onboard — it is rows, resolved.

### Platform defaults (`platform_config`)

A single row holds platform-wide defaults that were previously hard-coded
literals. Today it holds the default revenue split (`default_creator_share_bps` /
`default_platform_share_bps`, summing to 10000) plus a `config` JSONB escape
hatch for future platform defaults. It is world-readable and super-admin-writable.

Resolution happens in both layers from the same source of truth:
- **SQL** — `app.resolve_revenue_split` coalesces `record rule → tenant setting →
  platform_config` (no literal fallback — finding **F-11**).
- **App** — `getPlatformConfig()` (`src/lib/config/platform.ts`) backs the default
  tenant settings when a tenant has no `tenant_settings` row.

New platform defaults are added to `platform_config` **as their consumer arrives**
— the table is a typed default store, never a generic key/value bag.

## What is tenant-extensible, and how

The platform is generic, but "generic" does not mean "everything is an enum a
tenant can extend." Structural behavior is engine code; tenant variation is data.

| Kind of variation | Modeled as | Not as |
| --- | --- | --- |
| Competitors, options, labels, colors, images | records (`competitors`, `market_options`) + JSONB `metadata` | — |
| Branding / theme | `tenants.theme`, `tenant_settings` | — |
| Which features are on | `tenant_feature_flags` | — |
| Revenue split | `creator_revenue_rules` → `tenant_settings` → `platform_config` | — |
| Scoring values | `scoring_rules` (config) | hard-coded points |
| Vocabulary, default questions, media requirement, provider selection, engine version | Configuration Engine (added per consumer in later slices) | new enum values |

## Enum governance (finding F-07, constraint: classify every enum)

Every Postgres `ENUM` in the schema is classified below. The rule: **an enum
value is added by migration only when the value implies engine/system code.**
Tenant-extensible behavior is never modeled by letting tenants add enum values —
it is modeled with config or records (table above).

### Stable engine / system state — a new value means new engine code (migration appropriate)

These enumerate states and behaviors the engine itself implements. Each is a
closed set extended only by an additive `ALTER TYPE … ADD VALUE` migration when
the engine gains a capability (precedent: `0019` added draft notification types).

- **Identity / tenancy:** `tenant_status`, `user_status`, `global_role`,
  `membership_role`, `membership_status`, `creator_verification_status`
- **Competition domain:** `competition_type`, `competition_status`, `stage_kind`
  (has a `custom` escape), `event_status`, `option_status`, `prediction_status`,
  `settlement_status`, `sentiment_visibility`, `leaderboard_scope`
- **Market grading:** `market_type` — each value maps to an engine grading
  strategy (`MarketGrader`, §3); adding one is engine code + one additive value
- **Result ingestion:** `result_source_type` — engine *categories*
  (`manual` / `webhook` / `external_provider` / `future_adapter`); the specific
  provider behind a category is a record/adapter, not an enum value
- **Draft engine:** `draft_mode`, `draft_access_type`, `draft_visibility`,
  `draft_status`, `draft_assignment_status`, `draft_assignment_source`,
  `draft_payment_status`, `draft_scoring_type`
- **Billing / money:** `billing_provider_type`, `billing_product_type`,
  `billing_product_status`, `billing_checkout_status`, `billing_order_status`,
  `billing_refund_status`, `billing_interval_type`, `billing_entitlement_type`,
  `subscription_status`, `subscription_product_kind`, `entitlement_source_type`,
  `entitlement_status`, `creator_earning_status`, `creator_earning_type`,
  `creator_payout_status`, `sponsorship_status`
- **Prizes / fulfillment / social:** `prize_category`, `prize_award_status`,
  `fulfillment_owner_type`, `fulfillment_status`, `feed_activity_type`,
  `notification_type`

### Tenant-extensible behavior — modeled as config/records, so NOT an enum

There are currently **no** enums a tenant extends. The extensible dimensions
(vocabulary, default questions, media requirements, provider selection, scoring
values, revenue split) are all config or records per the table above. `enums.ts`
is kept in lockstep with the database by `tests/unit/enum-parity.test.ts`.

## Adding a new platform default

1. Add a typed column (or a `config` JSONB key) to `platform_config` in a
   migration, seeded with the current default.
2. Point the consumer (SQL function and/or `getPlatformConfig()`) at it.
3. Never leave a literal default behind in code once a config default exists.
