# Architecture Findings Register

The tracking spine for **Phase 7.5 — Platform Hardening & Genericity Completion**.
Every finding from the [Architecture Review](#source) is recorded here. **Nothing
disappears.** Each finding ends in exactly one terminal state:

- **Resolved** — the weakness is eliminated in code + tests.
- **Accepted** — a deliberate, documented trade-off we choose to keep for now.
- **Deferred** — real work, explicitly scheduled for a later phase.

Interim states while Phase 7.5 is in flight: **Open** (not started) · **In progress**.

> **Naming constraint (non-negotiable, applies to all Phase 7.5 work):** shared
> platform code, comments, schema, env, UI, docs, seed, tests, and git history
> must never name a specific vertical or downstream product. The engine is made
> generic *so that* independent products can be built on top of it — the engine
> itself stays vertical-neutral. This is identical in spirit to §7 of the phase brief.

## Severity legend

| Severity | Meaning |
| --- | --- |
| 🔴 **Critical** | Blocks the platform goal or is a security/correctness hazard. Must be Resolved. |
| 🟠 **Moderate** | Real architectural debt or genericity gap. Resolve or explicitly Accept. |
| 🟡 **Minor** | Low-impact hygiene. Resolve opportunistically or Accept. |

## Summary matrix

| ID | Finding | Sev | Phase 7.5 § | Target | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | Dual payment stacks (FNV-1a draft vs HMAC billing) | 🔴 | §2 | Resolve | ✅ Resolved |
| F-02 | Synchronous full-tenant recompute at settlement | 🔴 | §5, §6 | Resolve | Open |
| F-03 | Market grading is single-winner-only | 🟠 | §3 | Resolve | Open |
| F-04 | Hard-coded SQL scoring (`v_points := 1`) | 🟠 | §4 | Resolve | Open |
| F-05 | Only global leaderboard scope implemented | 🟠 | §6 | Resolve | Open |
| F-06 | Result source is manual-only (dormant enum values) | 🟠 | §9 | Resolve | Open |
| F-07 | Closed enums force migration to extend | 🟠 | §3, §15 | Accept (mitigate) | Open |
| F-08 | `as never` casts on money-path RPC boundaries | 🟠 | §15 | Resolve | Open |
| F-09 | Enum drift: hand-maintained vs generated, no check | 🟠 | §15 | Resolve | Open |
| F-10 | Duplicated logic (bracket gen, label maps) | 🟡 | §7, §15 | Resolve | Open |
| F-11 | Hard-coded 80/20 revenue split fallback | 🟠 | §4, §14 | Resolve | Open |
| F-12 | Recurring support renewals may not earn | 🟠 | §2 | Resolve | Open |
| F-13 | YouTube welded into event creation | 🟠 | §7, §10 | Resolve | Open |
| F-14 | Draft scoring position-only, winner-only baseline | 🟠 | §3, §4 | Resolve | Open |
| F-15 | Regrade drops recorded finishing positions | 🟠 | §5 | Resolve | Open |
| F-16 | Public `using(true)` tables isolated by app filter | 🟡 | §16 | Accept (document) | Open |
| F-17 | Read-time aggregation & event-page N+1 | 🟠 | §17 | Resolve | Open |
| F-18 | Feed has no keyset pagination | 🟡 | §17 | Resolve | Open |
| F-19 | Synchronous per-follower notification fan-out | 🟠 | §5, §11 | Resolve | Open |
| F-20 | `market_sentiment` lacks `(market_id, status)` index | 🟡 | §17 | Resolve | Open |
| F-21 | English-only default question despite `default_locale` | 🟡 | §7, §14 | Resolve | Open |
| F-22 | No notification delivery-channel abstraction | 🟠 | §11 | Resolve | Open |
| F-23 | No admin / ops surface | 🟠 | — | Defer (Phase 8) | Open |
| F-24 | `mock/pay` GET route lacks explicit env assertion | 🟡 | §2 | Resolve | ✅ Resolved |
| F-25 | `requestPayoutAction` persists unvalidated amount | 🟡 | §2 | Resolve | ✅ Resolved |
| F-26 | `approve_creator_payout` reject-cleanup ordering | 🟡 | §2 | Resolve | ✅ Resolved |
| F-27 | Grading math in SQL not covered by the tested TS | 🟠 | §4, §19 | Resolve | Open |
| F-28 | Shared global singletons (webhook ledger, job queue) | 🟡 | §17 | Accept (revisit) | Open |
| F-29 | Untyped `as unknown[]` JSONB casts | 🟡 | §15 | Resolve | Open |

Companion — **net-new platform capabilities** the phase mandates (not review
findings, tracked here so the register is the single spine):

| ID | Capability | Phase 7.5 § | Status |
| --- | --- | --- | --- |
| P-01 | EventProvider adapter interface | §8 | Open |
| P-02 | ResultProvider adapter interface | §9 | Open |
| P-03 | MediaProvider adapter interface | §10 | Open |
| P-04 | NotificationProvider adapter interface | §11 | Open |
| P-05 | Plugin manifest (name/version/capabilities/health/…) | §12 | Open |
| P-06 | Versioned Engine API | §13 | Open |
| P-07 | Configuration Engine | §14 | Open |

---

## Findings — detail

Each entry: **Description · Severity · Planned solution · Files affected ·
Database impact · Risk · Estimated effort · Status.**

### F-01 — Dual payment stacks 🔴
- **Description.** Two overlapping payment abstractions exist. `src/lib/payments/adapter.ts`
  handles paid Competitor Draft with a **non-cryptographic FNV-1a signature** and the
  `SUBSCRIPTION_WEBHOOK_SECRET`; `src/lib/billing/*` handles subscriptions & paid-draft
  checkout with HMAC-SHA256 and `BILLING_WEBHOOK_SECRET`. The paid-draft flow straddles both.
- **Planned solution.** Route paid Competitor Draft through the single `BillingProvider`
  pipeline (`startCheckoutAction` → verified webhook → `apply_billing_event`, which already
  confirms the draft reservation). Delete `src/lib/payments/*`, `completeMockPaymentAction`,
  `getPaymentAdapter`, the FNV-1a signer, and the `SUBSCRIPTION_*` env. One pipeline only.
- **Files affected.** `src/lib/payments/adapter.ts` (delete), `src/lib/domain/draft-actions.ts`,
  draft payment UI components, `src/lib/env.ts`, `.env.example`/`.env.local`, draft integration tests.
- **Database impact.** Deprecate the legacy `confirm_draft_payment` RPC / `draft_payments`
  path if fully superseded by `apply_billing_event`; additive migration only, no destructive drops.
- **Risk.** Low — paid draft is gated OFF in production (`PAID_DRAFT_CHECKOUT_ENABLED=false`);
  the free-draft path is untouched. Main risk is test churn.
- **Effort.** L (≈1–2 wk). **Status.** ✅ **Resolved** (migration `0028`).
  - `src/lib/payments/*` deleted (FNV-1a signer, `MockPaymentAdapter`, `getPaymentAdapter`);
    `completeMockPaymentAction` removed; `SUBSCRIPTION_PROVIDER` / `SUBSCRIPTION_WEBHOOK_SECRET`
    dropped from env + `.env` files.
  - `draft_competitor` now creates a **reservation only**; paid confirmation flows through the
    single `BillingProvider` pipeline (`startCheckoutAction` → verified webhook →
    `apply_billing_event`). `confirm_draft_payment` RPC + `draft_payments` table +
    `payment_reference_id` column dropped; `expire_draft_reservations` / `cancel_draft_assignment`
    updated to no longer reference them.
  - UI `pending_payment` state now renders the billing `CheckoutButton` (forwarding
    `draftReservationId`). Draft integration test reworked to confirm via `apply_billing_event`.
  - Verified: typecheck + lint + build clean; **141 tests pass**. Follow-up billing-function
    hardenings (F-12, F-24, F-25, F-26) tracked separately below.

### F-02 — Synchronous full-tenant recompute at settlement 🔴
- **Description.** Every settlement rebuilds the entire tenant leaderboard and re-scans each
  predictor's full grade history inside the transaction holding the event lock — O(all users).
  Draft competitions add a second full rebuild.
- **Planned solution.** Split settlement: the synchronous transaction does only
  validate/lock/grade/commit; leaderboards, stats, achievements, notifications, and draft
  standings become durable queued jobs (`system_jobs`) with retries + idempotency. See F-05/F-19.
- **Files affected.** `supabase/migrations/0011_settlement_functions.sql` (+ new async migration),
  `0017_draft_settlement.sql`, a new job-worker module + route/cron, tests.
- **Database impact.** New job rows + enqueue logic; settlement functions enqueue instead of
  recompute inline. Additive.
- **Risk.** Medium — settlement *correctness* must never depend on background jobs; grades are
  committed synchronously, derived caches are eventually consistent. Requires careful ordering.
- **Effort.** L. **Status.** Open.

### F-03 — Market grading is single-winner-only 🟠
- **Description.** `market_type` declares `YES_NO` and `MULTIPLE_CHOICE`, but only
  `SINGLE_CHOICE_WINNER` is created or settled; other shapes grade every prediction to `void`.
- **Planned solution.** A `MarketGrader` strategy per market type (Winner, Winner+Draw, Yes/No,
  Multiple Choice, future). Settlement asks the grader for the winning outcome + per-prediction
  result; no `switch (market_type)` scattered through the code.
- **Files affected.** new `src/lib/domain/graders/*`, settlement RPC(s), market-creation functions, tests.
- **Database impact.** Grading function generalized to resolve outcomes via a market-type-driven
  rule; additive.
- **Risk.** Medium — must preserve identical results for existing single-winner markets.
- **Effort.** M–L. **Status.** Open.

### F-04 — Hard-coded SQL scoring 🟠
- **Description.** Grading sets `v_points := 1` for correct in SQL, ignoring the typed
  `ScoringRule` that already exists in TS. Scoring can't change without a migration.
- **Planned solution.** Introduce a persisted `ScoringRule` (points, weighted, future) resolved
  from the Configuration Engine; the grader requests points from the configured rule.
- **Files affected.** settlement RPC, `src/lib/domain/scoring.ts`, config tables, tests.
- **Database impact.** Scoring rule read from config (existing `scoring_rules` table extended); additive.
- **Risk.** Medium — default rule must reproduce current 1-point behavior for existing tenants.
- **Effort.** M. **Status.** Open.

### F-05 — Only global leaderboard scope implemented 🟠
- **Description.** `creator` / `competition` / `season` leaderboard scopes and the
  `season_champion` / `creator_champion` achievements are schema-ready with no refresh function.
- **Planned solution.** Scope-parameterized incremental refresh covering all scopes (F-06/§6).
- **Files affected.** `0011_settlement_functions.sql` (+ new migration), leaderboard features, tests.
- **Database impact.** New refresh functions; additive.
- **Risk.** Low–Medium. **Effort.** M. **Status.** Open.

### F-06 — Result source is manual-only 🟠
- **Description.** `external_provider` / `webhook` / `future_adapter` enum values exist but
  nothing produces or consumes them — no automated settlement path.
- **Planned solution.** `ResultProvider` adapter (manual/api/webhook/csv) feeding normalized
  results into settlement (P-02, §9).
- **Files affected.** new `src/lib/providers/result/*`, settlement entry, tests.
- **Database impact.** Result-source recorded per settlement (column exists); additive.
- **Risk.** Low. **Effort.** M. **Status.** Open.

### F-07 — Closed enums force migration to extend 🟠
- **Description.** `market_type`, `competition_type`, `billing_product_type` are Postgres enums;
  a new shape needs a global `ALTER TYPE` migration.
- **Planned solution.** **Accept with mitigation.** The four generic competition formats and the
  grader-backed market types cover the near term; the `MarketGrader` registry (F-03) makes adding
  a market type a code+config change with a single additive `ALTER TYPE`, not a schema redesign.
  Document the "add a market type / competition format" path in the plugin guide.
- **Files affected.** docs. **Database impact.** none now. **Risk.** Low.
- **Effort.** S (documentation + registry). **Status.** Open → will land **Accepted**.

### F-08 — `as never` casts on money-path RPC boundaries 🟠
- **Description.** Five `as never` casts bypass generated RPC types on checkout, event creation,
  settlement, and `apply_billing_event`; the webhook payload enters the DB fully untyped.
- **Planned solution.** Regenerate DB types after schema settles, add typed RPC wrappers, remove casts.
- **Files affected.** `billing-actions.ts`, `creator-actions.ts`, `webhook.ts`, `src/types/*`.
- **Database impact.** none (type-only). **Risk.** Low. **Effort.** S. **Status.** Open.

### F-09 — Enum drift 🟠
- **Description.** Hand-maintained `src/types/enums.ts` must stay in lockstep with SQL enums and
  the generated `database.ts`; no check enforces agreement.
- **Planned solution.** Single source of truth: derive app enums from generated types (or a
  generated constants file) + a test asserting parity.
- **Files affected.** `src/types/enums.ts`, `src/types/database.ts`, a new parity test.
- **Database impact.** none. **Risk.** Low. **Effort.** S–M. **Status.** Open.

### F-10 — Duplicated logic 🟡
- **Description.** The bracket generator is reimplemented in `scripts/seed-demo.mjs`; competition-type
  label maps are copy-pasted across pages.
- **Planned solution.** Import the shared bracket module in the seed; a single label-map helper
  (folds into the Configuration Engine vocabulary, F-21).
- **Files affected.** `scripts/seed-demo.mjs`, tenant/competition pages, a shared helper.
- **Database impact.** none. **Risk.** Low. **Effort.** S. **Status.** Open.

### F-11 — Hard-coded 80/20 revenue split fallback 🟠
- **Description.** `resolve_revenue_split` falls back to `coalesce(…, 8000)` / `coalesce(…, 2000)`
  when no rule/setting exists — a hard-coded split contradicting "no hard-coded split."
- **Planned solution.** Source the platform default split from Configuration Engine defaults
  (tenant → platform), no literal fallback.
- **Files affected.** `0027_billing_functions.sql` (+ migration), config seed.
- **Database impact.** New default-config lookup; additive. **Risk.** Low. **Effort.** S. **Status.** Open.

### F-12 — Recurring support renewals may not earn 🟠
- **Description.** `creator_earnings` are recorded only on `order_created`; subscription renewal
  events (which carry an order but a different event name) appear to record no earning.
- **Planned solution.** Record earnings on the renewal/payment-success event as well, idempotently
  keyed per order id, while unifying the pipeline (§2).
- **Files affected.** `0027_billing_functions.sql` (+ migration), billing tests.
- **Database impact.** Additive change to `apply_billing_event`. **Risk.** Low–Medium (revenue correctness).
- **Effort.** S–M. **Status.** Open.

### F-13 — YouTube welded into event creation 🟠
- **Description.** A mandatory, non-clearable Live YouTube URL is enforced inside the generic
  `create_event_with_market`; a non-video vertical hits `YOUTUBE_REQUIRED`.
- **Planned solution.** Replace the hard requirement with a **MediaProvider** (P-03, §10) whose
  requirement is tenant configuration; YouTube becomes one provider, not a schema law.
- **Files affected.** `0023_event_youtube_required.sql` (superseding migration), event creation,
  media components, config.
- **Database impact.** Relax the enforced constraint to config-driven; additive migration that keeps
  existing data valid. **Risk.** Medium (touches a live constraint). **Effort.** M. **Status.** Open.

### F-14 — Draft scoring position-only 🟠
- **Description.** Draft scoring is position→points only with a winner-only auto-baseline and a
  single `draft_scoring_type` value.
- **Planned solution.** Fold draft scoring into the configurable ScoringRule model (F-04); allow
  additional draft scoring strategies via config.
- **Files affected.** `0012_draft_settings.sql`/`0017_draft_settlement.sql` (+ migration), config, tests.
- **Database impact.** Additive. **Risk.** Low–Medium. **Effort.** M. **Status.** Open.

### F-15 — Regrade drops recorded finishing positions 🟠
- **Description.** Manual podium data from `record_event_positions` isn't carried to the new grading
  version; draft standings silently collapse to winner-only after a regrade.
- **Planned solution.** Carry recorded positions forward across grading versions (or recompute from
  a version-independent source) as part of the async settlement rework (§5).
- **Files affected.** `0017_draft_settlement.sql` (+ migration), tests.
- **Database impact.** Additive. **Risk.** Medium (correctness). **Effort.** S–M. **Status.** Open.

### F-16 — Public `using(true)` tables isolated by app filter 🟡
- **Description.** likes/comments/leaderboards/stats/products use `using(true)`; cross-tenant
  isolation of this public data relies on the app always filtering `tenant_id`, not on RLS.
- **Planned solution.** **Accept and document** for now (this is public/aggregate data and the app
  narrows every query to the resolved tenant). Optionally add tenant-scoped policies as
  defense-in-depth before very high tenant counts — noted as a Phase-8+ hardening.
- **Files affected.** docs (`tenant-isolation.md`, `security-checklist.md`).
- **Database impact.** none now. **Risk.** Low. **Effort.** S. **Status.** Open → will land **Accepted**.

### F-17 — Read-time aggregation & event-page N+1 🟠
- **Description.** Sentiment and like counts re-aggregate on every page view; the event page issues
  ~3×M sequential queries across M markets.
- **Planned solution.** Batch options+sentiment+viewer-predictions across markets; cache/precompute
  hot aggregates; add the covering index (F-20).
- **Files affected.** `src/features/events/get-event.ts`, `src/features/social/get-event-social.ts`,
  sentiment RPC, migration for the index.
- **Database impact.** New index; optional cached counts. **Risk.** Low. **Effort.** M. **Status.** Open.

### F-18 — Feed has no keyset pagination 🟡
- **Description.** The feed is `LIMIT`-only; "load more" isn't reachable.
- **Planned solution.** Cursor/keyset pagination on `created_at`.
- **Files affected.** `src/features/social/get-feed.ts`, feed UI.
- **Database impact.** none (existing index suffices). **Risk.** Low. **Effort.** S. **Status.** Open.

### F-19 — Synchronous per-follower notification fan-out 🟠
- **Description.** On event publish, one notification row is inserted per follower inside the
  publishing transaction — linear with follower count.
- **Planned solution.** Queue notification fan-out as a durable job (§5) delivered via
  NotificationProvider (§11).
- **Files affected.** `0020_social_triggers.sql` (+ migration), job worker, tests.
- **Database impact.** Enqueue instead of inline insert; additive. **Risk.** Medium. **Effort.** M. **Status.** Open.

### F-20 — Missing `(market_id, status)` covering index 🟡
- **Description.** `market_sentiment` filters predictions on `market_id` + `status <> 'void'` but
  only `(market_id)` is indexed.
- **Planned solution.** Add the covering index.
- **Files affected.** new migration. **Database impact.** additive index. **Risk.** none. **Effort.** S. **Status.** Open.

### F-21 — English-only default question 🟡
- **Description.** The default market question ("Which competitor will win?") is hard-coded and
  English-only despite a `default_locale` column.
- **Planned solution.** Move default questions + vocabulary into the Configuration Engine
  (localized, tenant-overridable). Removes the last vertical/English literal from shared creation code.
- **Files affected.** creation functions, config tables/seed, UI copy.
- **Database impact.** Default text read from config; additive. **Risk.** Low. **Effort.** S–M. **Status.** Open.

### F-22 — No notification delivery-channel abstraction 🟠
- **Description.** Notifications are in-app rows only; there is no transport abstraction.
- **Planned solution.** `NotificationProvider` (email/push/sms/webhook/future) with a manifest
  (P-04, §11); producers stay transport-independent.
- **Files affected.** new `src/lib/providers/notification/*`, notification producers, config, tests.
- **Database impact.** Delivery metadata optional; additive. **Risk.** Low. **Effort.** M. **Status.** Open.

### F-23 — No admin / ops surface 🟠
- **Description.** Settlement queue, moderation, billing ops, reconciliation UIs don't exist.
- **Planned solution.** **Defer to Phase 8** (Admin & Operations) — the data model is already in
  place; this phase intentionally builds the platform substrate, not the operator UI.
- **Files affected.** — (Phase 8). **Database impact.** none now. **Risk.** Operational.
- **Effort.** L (Phase 8). **Status.** Open → will land **Deferred**.

### F-24 — `mock/pay` route lacks explicit env assertion 🟡
- **Description.** The mock hosted-checkout GET route self-signs webhooks and grants entitlements,
  gated only by `BILLING_PROVIDER=mock`.
- **Planned solution.** Add an explicit non-production / provider assertion at the route boundary
  during the payment unification (§2).
- **Files affected.** `src/app/api/billing/mock/pay/route.ts`. **Database impact.** none. **Risk.** Low.
- **Effort.** S. **Status.** ✅ **Resolved** (migration `0029` slice): the route now returns 404
  unless `BILLING_PROVIDER = mock`, so a real-provider deployment can never reach the self-signing path.

### F-25 — `requestPayoutAction` persists unvalidated amount 🟡
- **Description.** The action accepts a client `amountMinorUnits` and stores a `requested` payout
  with no server check against the earnings ledger (downstream approval still can't over-pay).
- **Planned solution.** Validate the requested amount against available earnings server-side at request time.
- **Files affected.** `src/lib/domain/billing-actions.ts`, `0029_payout_hardening.sql`.
- **Database impact.** `BEFORE INSERT` trigger on `creator_payout_requests`; additive. **Risk.** Low. **Effort.** S.
- **Status.** ✅ **Resolved** (migration `0029`): a DB trigger rejects any request whose amount is ≤ 0 or
  exceeds the creator's available, unallocated earnings — airtight even if a client bypasses the action.
  Integration-tested (over-request → `INSUFFICIENT_EARNINGS`).

### F-26 — `approve_creator_payout` reject-cleanup ordering 🟡
- **Description.** In the insufficient-funds branch, allocations are deleted before the dependent
  `update`, leaving a dead statement — harmless only because the subsequent `raise` rolls back.
- **Planned solution.** Reorder (update before delete) or drop the redundant statements.
- **Files affected.** `0029_payout_hardening.sql`. **Database impact.** function fix; additive.
- **Risk.** Low. **Effort.** S. **Status.** ✅ **Resolved** (migration `0029`): the insufficient-earnings
  branch now releases the reserved earnings *before* deleting the allocations.

### F-27 — Grading math in SQL not covered by tested TS 🟠
- **Description.** The production grader is SQL; the well-tested `scoring.ts` mirror is not the code
  that runs. No isolated coverage of the SQL grading/achievement math.
- **Planned solution.** With graders/scoring made config-driven (F-03/F-04), add integration tests
  that exercise the SQL grader across market types and scoring rules; keep the TS grader authoritative
  where feasible.
- **Files affected.** tests, grader modules. **Database impact.** none. **Risk.** Low. **Effort.** M. **Status.** Open.

### F-28 — Shared global singletons 🟡
- **Description.** `billing_webhook_events` and `system_jobs` are global (no `tenant_id`); potential
  hotspots at very high volume.
- **Planned solution.** **Accept** at current scale (standard pattern). Revisit partitioning/sharding
  as a scaling item well beyond 1,000 tenants; note in the scalability docs.
- **Files affected.** docs. **Database impact.** none now. **Risk.** Low. **Effort.** S. **Status.** Open → **Accepted**.

### F-29 — Untyped `as unknown[]` JSONB casts 🟡
- **Description.** `tenant_settings` JSONB blobs (`legal_links`/`footer_links`) are read via
  `as unknown[]` casts.
- **Planned solution.** Zod-parse these config blobs at the boundary (folds into the Configuration
  Engine typing, §14) and drop the casts.
- **Files affected.** `src/lib/tenant/context.ts`, config types. **Database impact.** none. **Risk.** Low.
- **Effort.** S. **Status.** Open.

---

## Source

Findings are drawn from the **Prediction Engine Architecture Review** (principal-architect
read-only audit of phases 1–7 + 4.5), conducted immediately before Phase 7.5. That review's
narrative, dependency graph, risk matrix, and genericity scorecard remain the reference
document; this register is its actionable, status-tracked counterpart.

## Change log

- **2026-08-05** — Register created; all 29 findings + 7 planned capabilities recorded at status
  Open with target dispositions. Phase 7.5 implementation begins with §2 (F-01).
- **2026-08-05** — **F-01 Resolved** (§2, migration `0028`): the two payment stacks are unified onto
  the single `BillingProvider` pipeline; legacy `lib/payments` + `confirm_draft_payment` +
  `draft_payments` removed. 141 tests pass. F-12/F-24/F-25/F-26 (billing-function hardenings) remain
  Open for the next §2 slice.
- **2026-08-05** — **F-24, F-25, F-26 Resolved** (§2, migration `0029`): mock-pay route gated to the
  mock provider (404 otherwise); a DB trigger rejects payout requests exceeding available earnings;
  `approve_creator_payout` releases-before-deletes in the insufficient-earnings branch. 142 tests pass.
  F-12 (recurring-renewal earnings) remains for its own slice.
