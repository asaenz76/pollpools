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
| `0008_brackets.sql` | `bracket_rounds`, `bracket_slots` + RLS (each slot is a matchup node) |
| `0009_bracket_functions.sql` | `create_bracket`, `advance_bracket` (+ internal propagation) |
| `0010_settlement_core.sql` | event_results, settlements, settlement_grades, user_statistics, competition_statistics, leaderboard_snapshots, achievements, user_achievements |
| `0011_settlement_functions.sql` | `settle_event`, `regrade_event` + recompute/achievement/leaderboard helpers |
| `0012_draft_settings.sql` | competition_draft_settings, draft_scoring_rules (+ `app.owns_competition`) |
| `0013_draft_assignments.sql` | competitor_draft_assignments, draft_payments (exclusivity + one-per-user unique indexes) |
| `0014_draft_scoring_tables.sql` | event_competitor_results, competitor_competition_stats, draft_leaderboard_snapshots |
| `0015_draft_prizes.sql` | competition_prizes, prize_awards |
| `0016_draft_functions.sql` | `draft_competitor`, `confirm_draft_payment`, `expire_draft_reservations`, `cancel_draft_assignment` |
| `0017_draft_settlement.sql` | draft scoring helpers + settlement trigger + `record_event_positions`, `award_competition_prizes` |
| `0018_draft_roster.sql` | `draft_roster` availability aggregate |

| `0019_social_tables.sql` | creator_follows, feed_activities, notifications, likes, comments |
| `0020_social_triggers.sql` | notification/feed emit helpers + triggers |
| `0021_public_history.sql` | `public_user_history` for public profiles |
| `0022_creator_functions.sql` | `create_event_with_market` (atomic event + market + options) |

Later phases add migrations for monetization. See [competitor-draft.md](competitor-draft.md), [social.md](social.md).

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
