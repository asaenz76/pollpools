# Tenant Creation Validation Report (Phase 7.75 + 7.75B)

**Question:** can materially different tenants be stood up and run end-to-end
through **configuration, seed data, feature flags, providers, and branding alone**
— no core engine code, no migrations, no new abstractions? This report covers
**three** fictional tenants across distinct verticals and records one architecture
leak found in the process.

Method: executable validation via integration tests. **No forbidden changes were
made** — only test files (see *Files changed*).

| Tenant | Vertical | Test | Result |
| --- | --- | --- | --- |
| **A — MatchCircle** | sports / clubs, three-way market | `tenant-a-matchcircle.test.ts` | 8/8 (1 leak documented) |
| **B — ColorCircuit** | livestream racing + Competitor Draft | `tenant-b-colorcircuit.test.ts` | 9/9 |
| **C — Cook-off Championship** | non-video culinary | `tenant-creation.test.ts` | 8/8 |

## Tenant A — MatchCircle (sports-style community)

Clubs as generic competitors; matches as generic events; a three-way **Home /
Draw / Away** market composed from generic options (two competitor-backed, one —
"Draw" — with no competitor).

- ✅ Tenant creation from config; League (SEASON) + Tournament (TOURNAMENT) types; clubs as generic competitors.
- ✅ Three-way market creation; predictions across all three options; Community Sentiment (3 options, correct vote totals).
- ✅ Settlement for **home win** and **away win** (competitor outcomes); **regrade** between competitor outcomes.
- ❌ **Settlement for "Draw"** — architecture leak (see below). Validated as a clean rejection (`WINNER_REQUIRED`); the Draw prediction is left ungraded, never mis-resolved.
- ✅ User statistics, streaks; global / creator / **season** (the league's competition leaderboard) leaderboards.
- ✅ Settlement notifications; feed activity.
- ✅ Event with no media; event with an optional generic livestream link.
- ✅ Reconciliation reports 0 differences; cross-tenant isolation.

## Tenant B — ColorCircuit (livestream racing + Draft)

Racers as generic competitors; single-winner "Which racer will win?" markets.

- ✅ Tenant creation; Season / Tournament / Bracket competition types; racers as generic competitors.
- ✅ Events with **no media / YouTube Live / TikTok Live / Twitch / generic external** links (each stored via the generic `event_media_links` model).
- ✅ Open Predictions remain free (no Draft required) and settle correctly.
- ✅ **Exclusive free Competitor Draft**: one user drafts one racer; a duplicate on the same racer is refused (`COMPETITOR_UNAVAILABLE`). Paid-draft config is present but production-disabled (not exercised).
- ✅ **Draft standings update on settlement**, kept in a **separate table** from the prediction leaderboard, and **update correctly through regrade** (racer0's drafter's points are removed when the result flips to racer1).
- ✅ Achievements granted **idempotently** (re-drain adds no duplicate grants).
- ✅ Creator-support billing works in **test (mock) mode** (one available earning per order).
- ✅ **Production drain endpoint** (`POST /api/internal/jobs/drain`, `CRON_SECRET`-authenticated) claims and processes real projection jobs end to end.
- ✅ Reconciliation reports 0 differences; cross-tenant isolation.

## Tenant C — Cook-off Championship (non-video)

Retained from Phase 7.75, still validating: non-video operation, chef competitors,
custom market wording, the predict→settle→projection lifecycle, statistics,
leaderboards, reconciliation (0 diffs), **75/25 revenue-split configuration**,
per-tenant feature flags, cross-tenant isolation, and engine version pinning
(`latest` rejected). **8/8.**

## Files changed

- `tests/integration/tenant-a-matchcircle.test.ts` (new)
- `tests/integration/tenant-b-colorcircuit.test.ts` (new)
- `tests/integration/tenant-creation.test.ts` (Tenant C; trivial unused-var cleanup only)
- `docs/tenant-creation-validation.md` (this report)

**Engine files changed:** none. **Migrations created:** none. **Shared
domain/settlement/grading/scoring/billing/jobs/reconciliation/UI/provider/schema
changes:** none.

## Templates used

None. Tenants are expressed entirely as **data + tenant settings + feature flags**
(competitions, competitors, events, markets, options, media links, draft settings,
draft scoring rules, billing products). No template system exists or was needed.

## Media-link results

Every kind stored and resolved via the generic `event_media_links` model: **no
media** (renders nothing), **YouTube** (inline nocookie embed), **TikTok Live /
Twitch / generic external** (safe external "Watch" link — no fabricated embeds). No
tenant is forced to depend on any platform.

## Market results

- **Single-winner** (racing, culinary): ✅ fully supported via competitor outcome resolution.
- **Three-way Home/Draw/Away** (sports): ⚠️ **partially** — competitor outcomes (home/away) settle and regrade; the **non-competitor "Draw" outcome cannot be settled** (leak below).

## Draft results

Exclusive free draft fully validated (assignment, exclusivity enforcement,
standings on settlement, separation from prediction leaderboard, regrade updates).
Paid draft config present but production-disabled — **real paid checkout was not
enabled**.

## Billing test results

Creator-support orders in mock mode record exactly one available earning; Tenant C
additionally validates a **configured 75/25 split**. No real payment provider used.

## Isolation results

Every tenant's events, statistics, leaderboards, and draft standings are invisible
to other tenants in all tests (asserted per tenant). RLS + tenant-scoped queries
hold across the three verticals.

## Operability results

The production **job-drain endpoint** processes projections under `CRON_SECRET`
auth (Tenant B). Reconciliation dry-run reports **0 differences** for all three
tenants after normal processing — async projections equal the canonical rebuild.

## Architecture leaks

### LEAK-1 — Non-competitor market outcomes cannot be settled (Draw) 🟠 Moderate

- **Tenant:** A (MatchCircle) — any three-way / draw / no-contest / multi-outcome market.
- **Desired behavior:** settle a Home/Draw/Away market to **"Draw"**, an outcome that is not a competitor.
- **Blocking file / subsystem:** `public.settle_event` (`supabase/migrations/0036_settlement_enqueue.sql:26` `WINNER_REQUIRED`; `:29–30` `INVALID_WINNER`; records `event_results.winning_competitor_id`). `public.regrade_event` mirrors it. **Note:** the grading core `app.apply_grading` (`0034:19–24`) *already* grades by an arbitrary winning-option set — so the limitation is in the settlement **contract**, not the grader.
- **Why configuration is insufficient:** there is no setting to make the winning competitor optional or to settle by option-set alone. The only data workaround is modeling "Draw" as a pseudo-competitor, which pollutes the competitor space (a Draw is not a Club) and records a false winning competitor in the immutable `event_results` — a data-integrity compromise, not clean configuration.
- **Severity:** Moderate. Blocks any market whose outcome isn't a single competitor (draws, over/under, YES/NO, multi-choice). This is the concrete manifestation of existing findings **F-03** (only `SINGLE_CHOICE_WINNER` grader implemented; `YES_NO`/`MULTIPLE_CHOICE` raise) at the settlement layer.
- **Recommended future fix (Phase 8, not implemented here):** allow `settle_event`/`regrade_event` to settle by `p_winning_option_ids` alone when `p_winning_competitor_id` is null (the grader already supports it), and record the outcome as an option/label rather than requiring a competitor (e.g. a nullable competitor + `winning_outcome_label`, or a registered `MULTIPLE_CHOICE` grader path).

### Secondary observation (not a blocker) — entity-type vocabulary is not tenant-configurable

The *type labels* a UI uses ("Club" vs "Racer" vs "Chef", "Match" vs "Race") are
not tenant-configurable — the shared engine is vocabulary-**neutral** (all names
are pure data, so no vertical term leaks *into* shared code), but there is no
config to localize/relabel entity types or the default English market question.
This is the already-tracked, Phase-8-deferred **F-21** (config vocabulary) and does
not block any tenant from operating (a creator supplies the wording as data, as all
three tenants do). Recorded for completeness; no new leak.

## Final verdict

> ## PARTIALLY

**Two of three tenants (B, C) validate fully with zero engine changes and zero
migrations.** Tenant A validates everything **except** the three-way market's
**Draw** outcome, which the existing settlement contract cannot express (LEAK-1).

The YES criteria are met on every point **except one**: *"three-way sports market
works using existing engine behavior"* is **false** — competitor outcomes (home,
away) work, but a non-competitor Draw does not settle. Because the criteria require
**all** points, the honest verdict is **PARTIALLY**, gated solely on LEAK-1. Per
the Architecture Leak Rule, the leak was **reported, not fixed** — resolving it is
Phase-8 work (a settlement-contract change, tied to F-03).

Everything else validated: zero engine-code changes, zero migrations, all tests
pass (381 total; 25 across the three tenants, stable ×2), optional media works, no
media works, Open Predictions work, Competitor Draft works where enabled,
settlement / regrade / projections / reconciliation work, and production job
draining works.

See also: [architecture-review-v2.md](architecture-review-v2.md),
[event-media.md](event-media.md), [architecture-findings-register.md](architecture-findings-register.md).
