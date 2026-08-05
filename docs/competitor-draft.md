# Competitor Draft Engine (Phase 4.5)

An **optional** participation model that runs **independently** from Open
Predictions. A competition may enable Open Predictions, Competitor Draft, or
both — but at least one must remain enabled, and drafting never gates free
predictions.

> **Product rule, kept visible everywhere:** *Drafting a competitor is optional.
> Everyone can still make free predictions.* (`DRAFT_OPTIONAL_NOTICE`, rendered by
> `DraftOptionalNotice`.)

Drafting a competitor **never** affects prediction accuracy, points, community
sentiment, prediction eligibility, or event settlement. User-facing copy uses
*draft / drafted competitor / your competitor / representing* — never ownership,
investment, share, token, bet, wager, odds, or cash prize.

## Modes & access

- **Mode** (`draft_mode`): `exclusive` (default — one user per competitor) or
  `open` (many users may draft the same competitor). Each user still drafts one
  competitor per competition (V1).
- **Access** (`draft_access_type`): `free` and `paid` implemented; `invite_only`
  and `admin_assigned` are modeled as safe extension points.

## Exclusivity & concurrency

`competitor_draft_assignments` has two partial unique indexes:
- `uq_draft_one_per_user` — one live assignment per user per competition.
- `uq_draft_exclusive_competitor` — one live assignment per competitor when
  `exclusive_slot` is set (so OPEN mode can share a competitor).

`draft_competitor` takes an **advisory lock per (competition, competitor)** and
re-checks availability, with the unique index as the ultimate backstop. The
concurrency test proves that two users drafting the same exclusive competitor
yield **exactly one success** and one `COMPETITOR_UNAVAILABLE`.

## Flows

- **Free** — `draft_competitor` creates a **confirmed** assignment atomically
  (active immediately if the competition is active). Idempotency key → repeat
  returns the existing assignment.
- **Paid** — creates a `pending_payment` reservation (default 10-minute window,
  `DRAFT_RESERVATION_MINUTES`) plus a `draft_payments` record whose fee and
  currency come **only** from server config (never the client). On verified
  payment, `confirm_draft_payment` (service role / verified webhook only)
  confirms idempotently (replay-safe via unique `(provider, provider_reference)`).
  `expire_draft_reservations` releases the competitor when a reservation lapses.
- Payment is **provider-agnostic**: `PaymentAdapter` interface + a `MockPaymentAdapter`
  test adapter (`src/lib/payments/adapter.ts`). No real provider is hard-coded.

## Draft scoring (separate from predictions)

`draft_scoring_rules.config.position_points` maps finishing position → points
(generic; not marble/F1-specific). Draft standings are the cumulative points of a
user's **drafted competitor**, never prediction points.

Integration with settlement is **fully additive**: a trigger on `settlements`
(`on_settlement_activated`) fires when any settlement becomes active (settle
**or** regrade), recording `event_competitor_results` (winner = position 1
baseline; `record_event_positions` enriches with a full finishing order) and
recomputing `competitor_competition_stats` + `draft_leaderboard_snapshots` from
the **active** results. Phase 4's `settle_event`/`regrade_event` are unchanged.
Because draft data is recomputed from the active version, **regrade corrects draft
standings** exactly like prediction stats (tested).

## Leaderboard (separate scope)

`draft_leaderboard_snapshots` is its own materialized table — never mixed with
`leaderboard_snapshots` (prediction). Tie-breakers (spec §10): points → wins →
podiums → best finishing position → earlier confirmation → assignment id. A user
can rank differently in the prediction vs. draft leaderboards.

## Prizes

Non-monetary only (`prize_category`: recognition, digital, physical, sponsor,
premium_access). `competition_prizes` defines placement + fulfillment metadata
(status tracking only — no automated shipping). `award_competition_prizes` awards
by placement **idempotently** (`prize_awards.idempotency_key` unique); awards are
never silently deleted (reversed/superseded).

## Permissions

- **Super admin**: configure any draft, override/cancel assignments, correct
  scoring, manage prizes/fulfillment.
- **Creator** (owns the competition, via `app.owns_competition`): enable/configure
  draft, add prizes, view participation; cannot alter confirmed assignments after
  close without super-admin review.
- **User**: draft one competitor (via `draft_competitor` only — no direct insert),
  view own assignment + public standings, cancel before confirmation.

## Security

RLS on every new table. Assignments/payments are owner + creator/admin only;
availability is exposed via the `draft_roster` aggregate (no leak of who drafted
whom). Fees/currency always from `competition_draft_settings`. Payment confirm is
service-role only + signature-verified + replay-safe.

## Tests

- Unit (`draft.test.ts`): position→points, standings tie-break, draft window,
  mock adapter signature/replay.
- Integration/concurrency (`draft.test.ts` integration): exclusivity, one-per-user,
  idempotency, open mode, non-drafters can still predict, paid reservation +
  confirm (idempotent), reservation expiry, settlement→standings, **regrade
  correction**, prize idempotency, **two-user concurrency (exactly one wins)**,
  draft/prediction leaderboard separation.
- All Phase 1–4 tests still pass (additive design).

## Deferred to later phases (documented hooks)

Draft notifications (Phase 5's notification system), the full creator draft-config
form and profile "Your Competitor Drafts" section (Phase 6), and creator/admin
draft analytics (Phase 8) — the data model and functions are in place.
