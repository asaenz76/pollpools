# Database Schema

UUID primary keys, explicit foreign keys, `tenant_id` on every tenant-owned
table, `created_at` / `updated_at` timestamps (with an `updated_at` trigger),
and enum types mirrored in `src/types/enums.ts`.

Migrations live in `supabase/migrations/` and are applied in order by
`supabase db reset` / `db start`.

## Migration map

| File | Contents |
| --- | --- |
| `0001_core_tenancy.sql` | extensions, **all** domain enums, `app` schema, tenancy + identity + creator tables, `updated_at` + auth-sync triggers |
| `0002_audit_ops.sql` | `audit_logs` (+ `app.write_audit`), `idempotency_records`, `system_jobs`, `moderation_reports` |
| `0003_rls_core.sql` | RLS helper functions, enable RLS everywhere, deny-by-default policies, creator privileged-column guard |
| `0004_grants.sql` | table-level grants for `anon` / `authenticated` / `service_role` (+ default privileges) |
| `0005_prediction_core.sql` | scoring_rules, competitions, competition_stages, competitors, events, event_competitors, markets, market_options, predictions, prediction_revisions |
| `0006_prediction_rls.sql` | ownership helpers + RLS for all Phase 2 tables (public content readable; predictions owner-only) |
| `0007_prediction_functions.sql` | `submit_prediction`, `market_sentiment`, `lock_due_markets` |

Later phases add migrations for settlement, statistics, leaderboards,
achievements, social, and monetization.

### Phase 2 tables (prediction domain)

`scoring_rules` (configurable; V1 default only) · `competitions` (generic, `type`
discriminates) · `competition_stages` · `competitors` (vertical-neutral) ·
`events` (`event_status` machine, `locks_at`) · `event_competitors` · `markets`
(`market_type`, `sentiment_visibility`) · `market_options` (optional competitor
map) · `predictions` (unique `(market_id,user_id)`, unique `idempotency_key`) ·
`prediction_revisions` (immutable edit trail). See
[prediction-engine.md](prediction-engine.md).

## Phase 1 tables

**Tenancy & identity**

- `tenants` — slug (unique), display name, status, locale/timezone, theme JSONB.
- `tenant_domains` — subdomain/custom-domain → tenant, `verified` flag.
- `tenant_settings` — 1:1 typed settings (sentiment visibility, min ranked
  predictions, revenue split bps with a `= 10000` check, enabled competition
  types, legal/footer links, extensible JSONB).
- `tenant_feature_flags` — `(tenant_id, flag)` unique; resolved by the typed
  `FeatureFlagService`.
- `users` — mirror of `auth.users` (soft-deletable; historical predictions
  survive account deletion).
- `profiles` — per-tenant public identity (`(tenant_id, user_id)` and
  `(tenant_id, handle)` unique).
- `tenant_memberships` — scoped role (`member`/`creator`/`admin`) + status.
- `user_roles` — global grants (super_admin); partial unique indexes for global
  vs tenant-scoped grants.
- `creators` — owner, slug, verification status,
  `supporter_subscriptions_enabled`, **`settlement_enabled`** (super-admin grant).
- `creator_channels` — YouTube channels per creator.

**Operations & security**

- `audit_logs` — append-only privileged-action log (indexed by tenant/time,
  entity, actor).
- `idempotency_records` — `(scope, idempotency_key)` unique; service-role only.
- `system_jobs` — background work queue (statistics rebuild, leaderboard
  refresh, notification fan-out).
- `moderation_reports` — report inbox with status workflow.

## Enums

All domain enums are declared in `0001` and mirrored in `src/types/enums.ts`:
`tenant_status`, `user_status`, `global_role`, `membership_role`,
`membership_status`, `creator_verification_status`, `competition_type`,
`competition_status`, `stage_kind`, `event_status`, `market_type`,
`market_status`, `option_status`, `prediction_status`, `settlement_status`,
`result_source_type`, `sentiment_visibility`, `subscription_status`,
`subscription_product_kind`, `sponsorship_status`, `leaderboard_scope`,
`feed_activity_type`, `notification_type`.

## Regenerating types

```bash
npm run db:types   # supabase gen types typescript --local > src/types/database.ts
```
