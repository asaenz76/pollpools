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

## Asynchronous projections (§5)

The synchronous settlement transaction is authoritative: it validates, locks,
creates the grading version, resolves winning options, persists immutable grades,
selects the active settlement, and commits. It does **not** recompute derived
projections inline — instead it enqueues small, version-aware jobs **in the same
transaction** (a transactional outbox), one per affected user (statistics +
achievements) plus one each for leaderboard, draft standings, feed, and
notifications. A durable worker (`src/lib/jobs`) drains them; a background-job
failure never affects the committed settlement. Each projection checks the
event's **active** settlement version and no-ops if the job is stale (superseded
by a regrade), so an old version's job can never overwrite the active
projections — order-independent, with no timing assumptions.

### Streak ordering (deterministic, regrade-invariant)

Streaks are sequence-dependent, so they are **recomputed** from the user's active
grades in a stable chronological order — never by ±1/reset mutation. The ordering
key, most significant first:

1. **event start time** (`events.starts_at`) — the event's scheduled occurrence.
   The schema records no separate "completed at", so start is the chronological
   anchor; a vertical that records a real completion time (in metadata) could
   layer it above this without changing the mechanism.
2. **active settlement activation** (`settlements.activated_at`) — fallback when an
   event has no start time.
3. **event id** — a **stable, deterministic tiebreak** for identical timestamps.
   This is regrade-invariant (unlike the previous grade-created-at tiebreak, which
   changed on every regrade and could reorder same-timestamp events).

Void/canceled outcomes are counted (`voided_predictions`) but never extend or
break a streak. `rebuild_user_statistics(tenant, user)` runs the same
deterministic logic as the incremental projection, so a full rebuild always
equals the incremental result.

### Scoped leaderboards

There are four **separate** leaderboard scopes: **global**, **creator**,
**competition**, and **season** (a season is a competition with `type='SEASON'`,
not a separate table). A settlement refreshes only the scopes its event
touches — global + creator + (competition XOR season) when the event has a
competition — so unrelated creators/competitions/seasons are never rebuilt. Each
scope is a **separate job** (distinct dedup key) for isolated retries; global and
competition rank from the maintained stats tables, so a leaderboard job runs only
after the affected users' stats jobs have **succeeded**. This is an **explicit
prerequisite check** (`app.user_stats_prereqs`), not a timing/FIFO assumption:
while any required stats job is pending/running/retrying the leaderboard **defers**
(re-scheduled, visible, no failure-budget cost); if a required stats job
dead-letters the leaderboard **blocks** visibly rather than publish stale data
(reconciliation repairs it). Prerequisites are scoped by `settlement_id`, so an
older version's dead stats job never blocks the current version. FIFO `seq`
ordering is kept only for predictable processing, not correctness. Ranking is
deterministic: total points → accuracy → correct →
earliest first-graded time → stable user id, with users below the tenant's
minimum-ranked-predictions threshold kept but unranked.

**Leaderboard model.** The "latest" leaderboard is a **mutable projection row**
per `(tenant, scope, scope_id, period='all_time', user)`, refreshed in place
(delete + reinsert for that scope only). The `period` column exists for future
periodic **immutable** snapshots, but none are produced today, so nothing
immutable is ever mutated or deleted. `rebuild_leaderboard_scope(tenant, scope,
scope_id)` and `rebuild_tenant_leaderboards(tenant)` are deterministic full
rebuilds (the latter never runs on the settlement path); a rebuild equals the
incremental result.

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
