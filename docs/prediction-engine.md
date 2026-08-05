# Prediction Engine (Phase 2)

The generic, sport-agnostic prediction core: how a prediction is made, locked,
and turned into community sentiment.

## Data model

```
competition ─┬─ (stage) ─┐
             │           ▼
             └────────▶ event ──▶ market ──▶ market_option
                          │                       ▲
             event_competitor ──▶ competitor ─────┘ (option may map to a competitor)
                                                   │
                              prediction (1 per market/user) ─▶ option
                                     │
                              prediction_revision (edit history)
```

- **competition** — one generic model; `type` ∈ {STANDALONE_EVENT, SEASON, TOURNAMENT, BRACKET}.
- **competitor** — vertical-neutral (a marble, driver, team…); identity is a label + image + JSONB metadata.
- **event** — a real-world occurrence with an explicit `event_status` state machine and a `locks_at`.
- **market** — a question on an event; V1 types SINGLE_CHOICE_WINNER, YES_NO, MULTIPLE_CHOICE.
- **market_option** — a choice, optionally mapped to a competitor.
- **prediction** — exactly one per `(market, user)`; keeps `original_option_id` and current `option_id`.
- **prediction_revision** — immutable trail of every pre-lock change.

## Submitting a prediction

All writes go through the `submit_prediction(market_id, option_id, idempotency_key, source)`
database function (SECURITY DEFINER). There is **no direct client write policy**
on `predictions`. The function, in one transaction:

1. Short-circuits if the idempotency key was already used (returns the prior result).
2. Takes a per-`(market,user)` advisory lock (fine-grained concurrency control).
3. Rejects suspended/deleted accounts and non-members.
4. Requires `market.status = 'open'` **and** `now() < locks_at` — **server time is
   the only authority**; the client clock is never consulted.
5. Validates the option belongs to the market and is active.
6. Inserts (or, if editing is enabled and pre-lock, updates) the prediction and
   appends a revision.
7. Records the idempotency key.

Error codes (`AUTH_REQUIRED`, `NOT_A_MEMBER`, `MARKET_LOCKED`, `MARKET_NOT_OPEN`,
`INVALID_OPTION`, `PREDICTION_LOCKED`, `EDITING_DISABLED`, …) are mapped to
friendly copy in the `submitPrediction` server action.

### Locking

`getLockState()` (pure TS) mirrors the DB gate for display — computing whether a
market is open and the countdown — but the authoritative check is `now()` inside
`submit_prediction`. The `lock_due_markets()` maintenance function flips
`open → locked` once `locks_at` passes (service-role only).

## Community sentiment (never odds)

- `market_sentiment(market_id)` aggregates **valid** predictions (excludes void)
  per option. It is SECURITY DEFINER so it can count across all users without
  exposing any individual pick (individual predictions are owner-readable only).
- `computeSentiment()` (pure TS) turns counts into integer percentages using the
  **largest-remainder (Hamilton) method** with a deterministic tie-break, so the
  displayed values total **exactly 100**.
- Copy is sentiment-first: "Picked by X%", or "Picked by X of Y" for small
  participation (tenant-configurable), or "No community sentiment yet." at zero.
  A future `sentiment_visibility` (always | after_prediction | after_lock) is
  stored on the market; V1 defaults to `always`.

## Tests

- Unit: `sentiment.test.ts` (rounding to 100, ties, edge cases), `locking.test.ts`.
- Integration (`predictions.test.ts`, live DB): one-per-market, edit-vs-duplicate,
  idempotency, server-time lock, not-open, cross-market option, non-member,
  suspended account, no-direct-write, and sentiment aggregation.
