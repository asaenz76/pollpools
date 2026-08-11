# Creator Event Lifecycle

Authorized creators get complete, safe control over the events they own. This
layer **extends** the existing engine — it adds lifecycle *transitions*; it never
forks event or settlement logic. Settlement, grading, and regrade stay entirely in
`settle_event` / `regrade_event` (see [settlement.md](settlement.md)).

## State machine

```
DRAFT ──publish──▶ OPEN ──lock──▶ LOCKED ──settle──▶ SETTLED
  │                 │              │                    │
  └──────── cancel ─┴──────────────┘        correct ────┤ (new grading version)
            ▼                                            │
         CANCELED (terminal)                    void ────▶ VOIDED
```

All values already existed in the `event_status` enum (`0001`); no new state was
introduced. `scheduled / published / live / waiting_result / settlement_pending`
remain defined but unused by these transitions.

| Transition | RPC (migration `0069`) | Authorization | Notes |
|---|---|---|---|
| Publish | `public.publish_event(uuid)` | `app.can_manage_event` | DRAFT→OPEN; fires the existing publish fan-out trigger. Idempotent. |
| Lock (manual) | `public.lock_event(uuid)` | `app.can_manage_event` | OPEN→LOCKED. Idempotent. No unlock (V1). |
| Cancel | `public.cancel_event(uuid, text)` | `app.can_manage_event` | DRAFT/OPEN/LOCKED→CANCELED. Idempotent. Rejects a settled event (`ALREADY_SETTLED`). |
| Edit | `public.update_event(uuid, jsonb)` | `app.can_manage_event` | Safe fields always; structural fields gated (below). |
| Settle | `public.settle_event(...)` | `app.can_settle_event` | Reused verbatim (`0047`) + one canceled-event guard. |
| Correct | `public.regrade_event(..., 'settled')` | `app.can_settle_event` | New grading version; prior versions immutable. |
| Void | `public.regrade_event(..., 'voided')` | `app.can_settle_event` | The distinct correction workflow for a settled event (§13). |

**Two authorization tiers.** *Managing* an event (edit / publish / lock / cancel)
requires only ownership — `app.can_manage_event` = super-admin, service role, or the
event's creator-owner. *Settling* (settle / correct / void) additionally requires
`settlement_enabled` — `app.can_settle_event` (unchanged). Both are enforced
server-side and DB-side (SECURITY DEFINER); the UI only *offers* valid actions but
the database is the authority. Cross-tenant callers fail (`NOT_AUTHORIZED`).

## Editing & prediction integrity

`update_event` applies a partial `jsonb` patch:

- **Safe fields — always allowed** (while non-terminal): `title`, `description`,
  `youtube_url`, `external_url`, `cover_image_url`, `metadata`. Timing (`starts_at`,
  `locks_at`) is editable only while DRAFT/OPEN, so editing a lock time can never
  reopen a locked event (`TIMING_LOCKED` otherwise).
- **Structural fields — blocked once a prediction exists** (`app.event_has_predictions`):
  `market_question`, option `label`s → `PREDICTIONS_EXIST`. The meaning of a
  submitted prediction is never silently changed (spec §3–§4).
- **Competitor set / market type** are never edited in place →
  `STRUCTURAL_CHANGE_REQUIRES_RECREATE` (cancel + recreate instead).

The edit UI hides the structural section once predictions exist; the DB rejects it
regardless.

## Locking: manual and automatic converge

Manual `lock_event` and automatic `lock_due_markets` (`0007`) produce the **same**
authoritative locked state: the event **and** its open markets flip to `locked`,
after which `submit_prediction` rejects new predictions (`MARKET_NOT_OPEN` plus the
server `now() >= locks_at` gate — the prediction gate is time-authoritative
regardless of which lock ran). `lock_due_markets` only ever flips `open→locked`, so
a manually locked event never reopens when its scheduled `locks_at` is later edited.
Auto-lock is now driven once per tick from the global job drain
(`src/lib/ops/scheduled.ts`); previously it was defined but unscheduled.

## Cancellation semantics

Cancellation is terminal and **non-destructive**:

- The event → `canceled`, its markets → `canceled`, and its predictions → `void`
  (preserved, never deleted).
- **No grades or projections are written.** An unsettled event was never counted in
  any derived stat — leaderboards, streaks, achievements, and competitor-draft
  standings all read active-settlement grades, of which a never-settled event has
  none. So there is nothing to rebuild, and reconciliation still returns the
  canonical state (zero differences).
- Affected participants get one `event_canceled` notification (mandatory), fanned
  out asynchronously via `projection.event_cancel` → `app.emit_notification`
  (deduped per event+user). Audited as `event.cancel`.
- A **settled** event cannot be canceled here (`ALREADY_SETTLED`) — it becomes void
  through the regrade-to-void correction workflow instead (spec §13).

### Community Health exclusion (`0070`)

Community Health is the one system that reads `events`/`predictions` directly rather
than through grades, so it needs explicit exclusion of canceled/voided events. Three
queries in `app.calculate_community_health` now exclude them: the baseline
`events_total` gate, **Event Consistency** (a week whose only event was canceled is
not an active week), and **Prediction Participation** (predictions on a
canceled/voided event don't count). A creator canceling one legitimate event is
never treated as if the community failed to participate. The formula version is
unchanged, so historical snapshots stay immutable. WAU and Revenue Plan
qualification are independent of event status and untouched.

## Correction & void (regrade)

`correctResultAction` and `voidEventResultAction` reuse `regrade_event`: it
supersedes the active settlement with a new grading version (`status='superseded'`,
never edited/deleted — history preserved), re-runs projections version-aware, and
emits a single `prediction_updated` "Result corrected" notice per affected
prediction (deduped by version). Void re-grades every prediction to `void`/0 points.

## UI surfaces

- **Management hub** — `creator/e/[eventId]/page.tsx`: status badge (text label, not
  color-only), Start/Locks/Predictions, the current result, and only the
  state-valid actions.
- **Edit** — `creator/e/[eventId]/edit/page.tsx` + `EventEditForm`.
- **Settle / correct** — `creator/e/[eventId]/result/page.tsx` (branches on status).
- Confirmations for lock / cancel / void use `ConfirmDialog`
  (`components/ui/confirm-dialog.tsx`). Public event cards carry no management
  controls.

## Backwards compatibility

Additive throughout. `settle_event` is re-created identically to `0047` except for
one guard (a canceled event cannot be settled → `EVENT_CANCELED`); the winning-vs-
cancel race is decided by the row lock — exactly one authoritative state results.
Existing settled events, historical grades, regrade, leaderboards, draft, growth,
templates, domains, billing, notifications, feed, reconciliation, and admin are
unchanged. Verified by the full suite (see `tests/integration/event-lifecycle.test.ts`).
