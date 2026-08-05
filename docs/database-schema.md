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

Later phases add migrations for competitions, events, markets, predictions,
settlement, statistics, leaderboards, achievements, social, and monetization.

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
