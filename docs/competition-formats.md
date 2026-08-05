# Competition Formats

One generic `competitions` model powers all four V1 formats; `type` discriminates.
Nothing is hard-coded to a vertical.

| Type | Structure | Progression |
| --- | --- | --- |
| `STANDALONE_EVENT` | a single event, no parent | — |
| `SEASON` | a collection of events over time | cumulative points, season leaderboard (Phase 4) |
| `TOURNAMENT` | stages (`competition_stages`) each holding events | sequential; creator-managed in V1 |
| `BRACKET` | single-elimination tree | automatic advancement by winner relationship |

## Season

A `SEASON` competition groups events (`events.competition_id`). Events can be
added after the season is created. Season dates live on the competition; the
season leaderboard and cumulative points are computed by the settlement/stats
engine (Phase 4). No relegation/promotion in V1.

## Tournament

A `TOURNAMENT` has ordered `competition_stages` (`stage_kind` ∈ qualifier,
group_stage, quarterfinal, semifinal, final, …) and events attached to stages
(`events.stage_id`). Progression between stages is **manually managed by the
creator** in V1 — no automatic qualification rules.

## Bracket (single elimination)

The spec-critical format. Implemented as a tree in `bracket_slots`, where **each
slot is a matchup node** carrying its two competitors and pointers
(`source_a_id` / `source_b_id`) to the two feeder matchups whose winners fill it.

**Size — 2 to 32 competitors, creator-selected.** When creating a knockout the
creator chooses the competitors; their count is the bracket size (byes fill out
the next power of two). The bound is enforced in three places: the `createBracket`
server action (`MIN/MAX_BRACKET_COMPETITORS`), `generateBracket`, and the
`create_bracket` DB function (`BRACKET_TOO_LARGE`). Round names follow the size:
Round of 32 → Round of 16 → Quarterfinals → Semifinals → Final.

- **Generation** — `src/lib/domain/bracket.ts` (pure, unit-tested) computes the
  structure: bracket size = next power of two ≥ competitor count; standard seed
  order (each first-round pair sums to size+1, so top seeds meet late); byes for
  the extra top seeds when the count isn't a power of two (no bye-vs-bye).
- **Persistence** — `create_bracket(competition, structure)` (owner/super-admin)
  inserts rounds + slots, wires the source relationships, resolves byes, and
  opens the first playable matchups (creating their events + markets + options).
- **Advancement by relationship** — competitors are **never duplicated** between
  rounds. When a matchup settles, `advance_bracket(event, winner)` (service-role
  only, called by the settlement engine) records the winner and pushes it into
  the child slot; once both competitors of the next matchup are known, that
  matchup's event is opened automatically.
- **Correcting an early result** after later rounds exist is a regrade concern
  handled by the settlement engine (Phase 4), which re-runs advancement.

Only single elimination in V1 (no double elimination).

### Data model

`bracket_rounds(competition_id, round_number, name, size)` ·
`bracket_slots(competition_id, round_id, match_index, position, event_id,
competitor_a_id, competitor_b_id, source_a_id, source_b_id, winner_competitor_id,
is_bye, bye_competitor_id, status)`.

### Tests

- Unit (`bracket.test.ts`): seed order, pairing sums, byes for non-power-of-two,
  advancement through rounds, readiness gating.
- Integration (`brackets.test.ts`, live DB): create → bye resolution → open first
  matchups → advance to champion; winner validation; non-owner rejected.
