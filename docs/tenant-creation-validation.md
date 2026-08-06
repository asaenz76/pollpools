# Phase 7.75 — Tenant Creation Validation

**Question:** can a brand-new tenant of a *different, non-video* vertical be stood
up and run end-to-end through **configuration and data alone** — no code changes,
no migrations? This phase answers it with an executable proof and records the one
remaining vertical assumption.

## What was validated

`tests/integration/tenant-creation.test.ts` provisions a **"Cook-off
Championship"** tenant (chefs as competitors, no livestream) and exercises the full
generic engine. Every step is data/config only — nothing in shared code is
special-cased for the vertical.

| Capability | Result |
| --- | --- |
| Tenant creation from `slug` + `display_name` alone | ✅ generic defaults resolve (`engine_version = 1.0`, media enabled + optional, no preferred provider) |
| Event creation with **no media** (no YouTube/video dependency) | ✅ publishes `open`, 0 media rows; option labels come from competitor data, not code |
| Predict → settle → projection lifecycle | ✅ grades, user statistics, streaks, and the global leaderboard populate for the tenant |
| Reconciliation (`reconcile` dry-run, tenant scope) | ✅ 0 differences — async projections equal the canonical rebuild |
| Tenant-configured revenue split (75/25) on billing | ✅ a 500 support order earns 375/125 from config, no literal |
| Per-tenant feature flags | ✅ configurable without code |
| Cross-tenant isolation | ✅ a second tenant sees none of this tenant's events/stats |
| Engine version pinning | ✅ explicit `1.0`; `latest` rejected by the DB check constraint |

**Conclusion:** a new tenant is **config-instantiable** end-to-end. The generic
substrate (tenancy, media-optional events, grading, scoring, settlement, jobs,
leaderboards, reconciliation, billing split, flags, versioning) carries a novel
vertical with **zero code or migration changes**.

## Residual vertical assumption (known, deferred)

The one shared-code literal that a new tenant cannot yet reshape by config:

- **F-21 — default market question.** When a creator omits the market question,
  the engine falls back to the English literal `"Which competitor will win?"`
  (`create_event_with_market`). `tenants.default_locale` is stored but unread. This
  does not block a tenant (the creator can pass any question, as the cook-off does:
  `"Which chef will win?"`), but the *default* is not localized/config-driven. It
  is **Deferred to Phase 8** (config vocabulary), tracked in the
  [findings register](architecture-findings-register.md). No other vertical literal
  remains in the shared creation path.

## Scope of the claim

- **Config-instantiable** (proven here): a new tenant runs the full lifecycle with
  only data + tenant settings + flags.
- **Config-shapeable** (not yet): vocabulary, default question/locale, media
  provider embed adapters, and result/notification providers are Phase-8 breadth
  work (P-01…P-05, F-21) — a new tenant inherits the current vocabulary defaults
  until then.

See also: [event-media.md](event-media.md), [configuration.md](configuration.md),
[architecture-review-v2.md](architecture-review-v2.md).
