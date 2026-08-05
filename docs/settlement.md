# Settlement, Scoring, Statistics & Leaderboards

The other high-risk core. `settle_event` / `regrade_event` are the only entry
points; both are atomic, idempotent, and versioned.

## Settlement state machine

```
             settle_event
  (open|locked|live|waiting_result) ──────────────▶ settled / voided / canceled
                                                        │
                                          regrade_event │  (creates a NEW version,
                                                        ▼   supersedes the old)
                                            settled (v2) with v1 → superseded
```

`settlements.status` ∈ `pending → active → (superseded | reversed | failed)`.
A **partial unique index** guarantees at most one `active` settlement per event.
`(event_id, grading_version)` is unique, so a retry can't create a duplicate
version. An idempotency key on `settle_event`/`regrade_event` returns the prior
result on retry.

## Why it's safe to reverse

`settlement_grades` are **immutable** per grading version — we never edit or
delete them. Derived statistics (`user_statistics`, `competition_statistics`) are
a **cache recomputed from the currently-active grades**, not incremented in place.
So settle, void, and regrade are all just "recompute from the active set":

- **settle** — create version, grade predictions, activate, recompute affected users.
- **regrade** — supersede the active version, create a new active version with
  corrected grades, recompute. Statistics and streaks land on the correct value
  because they're recomputed from scratch, never patched.

The workflow (spec §13) runs in one transaction: lock event → verify eligibility
→ record result → mark winning option → grade predictions → recompute stats →
recompute streaks → grant achievements → refresh leaderboard → activate settlement
→ (bracket advancement) → audit.

## Authorization

`can_settle_event` allows a **super admin**, the **service role** (automation),
or a **creator who owns the event AND has `settlement_enabled` granted** by a
super admin. High-risk in production → intended to be behind step-up confirmation
in the admin/creator UI (Phase 8).

## Scoring (spec §14)

V1 default rule only: correct = **1 point**, incorrect/void/canceled/no-prediction
= 0. The rule is a typed structure (`scoring_rules`) so per-tenant / per-competition
rules can be added later. Pure helpers: `gradePrediction`, `pointsFor`.

## Streaks (spec §15)

Recomputed from ordered graded history, never incremented: correct extends,
incorrect resets to 0, void/canceled are skipped. `best_streak` is the all-time
max over the active history. Pure helper: `computeStreaks` (fully reversible, so
a regrade restores the correct streak — tested).

## Leaderboards (spec §16)

`leaderboard_snapshots` is materialized by `refresh_global_leaderboard` at
settlement time, so browsing is a cheap read. Ranking order: points → accuracy →
correct → earliest-to-reach → stable user id. Users below
`minimum_ranked_predictions` (default 5) are shown separately as unranked. Pure
helper: `rankLeaderboard`. Scopes: global (materialized), creator/competition/
season (competition_statistics + snapshots).

## Achievements (spec §17)

Tenant-scoped, rule-driven definitions (`achievements`); immutable grants
(`user_achievements`, revocable via `revoked_at`, unique per user+achievement so
grants are idempotent). `evaluate_achievements` grants stats-driven achievements
(first prediction, first correct, streak, count, accuracy) after each recompute.
Champion achievements (season/creator) are granted on leaderboard finalization.

## Bracket advancement

When a bracket matchup settles, `settle_event` calls `advance_bracket`, which
fills the next slot with the winner and opens the next matchup once both
competitors are known (Phase 3). **V1 limitation**: regrading a bracket matchup
after downstream matchups already exist records the corrected winner on that slot
but does not automatically rewrite already-generated downstream matchups — that
is a documented manual-review step.

## Tests

- Unit: `scoring-streaks-leaderboard.test.ts` (grading, reversible streaks, tie-breaking, thresholds).
- Integration (`settlement.test.ts`, live DB): grading + stats, idempotent retry,
  ALREADY_SETTLED, reversible regrade, achievement idempotency, void, leaderboard
  population, bracket advancement on settle, and settlement authorization.
