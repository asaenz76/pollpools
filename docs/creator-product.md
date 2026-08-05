# Creator Product (Phase 6)

The Creator Studio (`/t/{slug}/creator`) — where a user becomes a creator and runs
competitions. Everything is authorized to the creator owner (or super admin) by
RLS + the `create_event_with_market` / `settle_event` function guards; nothing
trusts a client-supplied tenant or creator id.

## Flows

- **Onboarding** — `becomeCreatorAction` ensures membership and creates a
  `creators` row (`verification_status = 'pending'`). Tenant is resolved from the
  URL slug, never a client id.
- **Dashboard** — verification badge, stats (competitions / events / competitors /
  predictions), and lists of the creator's competitions + events.
- **Verification status** — shown on the dashboard and the submit-result page;
  a super admin verifies creators (Phase 8).
- **Competitors** — add/list (`addCompetitorAction`, RLS `owns_creator`).
- **Create** (chooser → format):
  - **Standalone race** and **competition events** → `create_event_with_market`
    (atomic: event + event_competitors + market + competitor-mapped options).
  - **Season / Tournament** → `createCompetitionAction` (then add events).
  - **Knockout bracket** → `createBracketCompetitionAction` = create BRACKET
    competition + `create_bracket` from a **2–32** competitor picker (byes auto).
- **Manage competition** — list its events + add events (bracket matchups are
  auto-generated and advance on settlement).
- **Submit result** — `submitResultAction` → `settle_event`. Creators with the
  `settlement_enabled` grant settle directly; otherwise the UI explains results
  are settled by an admin (Phase 8).
- **Edit profile**, **Analytics** (followers + per-event participation).

## Key primitive

`create_event_with_market(creator, competition?, title, slug, …, competitor_ids[],
question, publish)` — SECURITY DEFINER, owner/super-admin only, validates ≥2
competitors and slug format, and builds the event + market + options in one
transaction with options carrying each competitor's name + color.

## Navigation

Entry points: the tenant home "You're in" card (Creator Studio / Browse creators)
and the bottom-nav "You" → profile. All studio pages redirect signed-out users to
sign-in and non-creators to onboarding.

## Tests

`creator.test.ts` (integration): `create_event_with_market` builds the event +
market + competitor-mapped options; rejects <2 competitors and non-owners; makes
a draft when `publish=false`; and the owner-can-insert / non-owner-blocked RLS
paths used by the competitor/competition actions. Bracket + result submission
wrap the already-tested `create_bracket` and `settle_event`.

## Deferred to later phases

Creator **channel management** UI, **verification review** (super-admin, Phase 8),
and monetization overviews (**supporter / subscription revenue / sponsorships**,
Phase 7) — the data model exists; the studio surfaces them as those land.
