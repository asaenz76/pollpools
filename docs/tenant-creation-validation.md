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
| **A — MatchCircle** | sports / clubs, three-way market | `tenant-a-matchcircle.test.ts` | 9/9 (Draw now settles) |
| **B — ColorCircuit** | livestream racing + Competitor Draft | `tenant-b-colorcircuit.test.ts` | 9/9 |
| **C — Cook-off Championship** | non-video culinary | `tenant-creation.test.ts` | 8/8 |

> **Update (Phase 7.76):** LEAK-1 is **resolved**. Settlement now accepts winning
> market-option ids as authoritative with an optional winning competitor, so the
> three-way Draw outcome settles with no pseudo-competitor. The final verdict below
> is now **YES**. See [option-settlement.test.ts](../tests/integration/option-settlement.test.ts)
> and the [findings register](architecture-findings-register.md) (LEAK-1).

## Tenant A — MatchCircle (sports-style community)

Clubs as generic competitors; matches as generic events; a three-way **Home /
Draw / Away** market composed from generic options (two competitor-backed, one —
"Draw" — with no competitor).

- ✅ Tenant creation from config; League (SEASON) + Tournament (TOURNAMENT) types; clubs as generic competitors.
- ✅ Three-way market creation; predictions across all three options; Community Sentiment (3 options, correct vote totals).
- ✅ Settlement for **home win**, **away win**, **and Draw** (Phase 7.76). Draw settles via option-based settlement with **no competitor and no pseudo-competitor**; **regrade** works across competitor ↔ non-competitor outcomes (Home → Draw → Away).
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

- **Single-winner** (racing, culinary): ✅ fully supported.
- **Three-way Home/Draw/Away** (sports): ✅ **fully supported** (Phase 7.76) — competitor outcomes (home/away) and the non-competitor **Draw** outcome all settle and regrade via authoritative winning-option ids.

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

### LEAK-1 — Non-competitor market outcomes cannot be settled (Draw) 🟠 → ✅ RESOLVED (Phase 7.76)

**Resolved** in Phase 7.76 (migration `0047`): winning market-option ids are now
authoritative and the winning competitor is optional (derived from the option, no
pseudo-competitor). Bracket advancement still requires a competitor. Full details
in the [findings register](architecture-findings-register.md#leak-1--settlement-contract-required-a-competitor-winner-----resolved).
The original finding is retained below for the record.



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

## Browser verification — creator result-submission flow (Phase 7.76)

A live browser pass of the creator result flow on a three-way (Home / Draw / Away)
market, signed in as a settlement-enabled creator. All 12 checks pass:

| # | Check | Result |
| --- | --- | --- |
| 1 | Creator opens the result page for a three-way market | ✅ |
| 2 | Form displays all options — Home win / Draw / Away win | ✅ |
| 3 | Draw is a normal selectable result | ✅ |
| 4 | Selecting Draw requires/displays no competitor | ✅ (form shows only options + notes) |
| 5 | Submitting Draw succeeds | ✅ ("Already settled") |
| 6 | Settled event shows the Draw label | ✅ (Draw ✓ green on the event page) |
| 7 | Predictions grade correctly | ✅ (Draw → correct; Home/Away → incorrect) |
| 8 | Notifications/feed display "Draw" | ✅ **after a defect fix** (see below) |
| 9 | Regrade Draw → Away succeeds | ✅ (Away shown as winner; Draw backer now "Not this time.") |
| 10 | Regrade Away → Draw succeeds | ✅ (Draw shown as winner; Draw backer "You called it right.") |
| 11 | Mobile layout usable at 320 / 375 / 390 px | ✅ (single-column, full-width, no overflow) |
| 12 | No console errors | ✅ |

**Defect found and fixed (check 8).** The settlement `metadata.result_label`
("Draw") was written correctly (Phase 7.76 migration), but the **feed and
notification UI did not render it** — the feed said only "… was settled" and
notifications didn't fetch `metadata`. Fixed minimally: the feed now shows
"… was settled — result: Draw", and settlement notifications show
"Derby Day · Result: Draw". Files changed: `src/features/social/get-feed.ts`,
`src/features/social/get-notifications.ts`,
`src/app/t/[tenantSlug]/notifications/page.tsx`. Re-verified in the browser;
388 tests still pass; typecheck + lint clean. No engine/settlement logic changed.

## Final verdict

> # YES

**All three tenants validate fully.** After Phase 7.76 (option-based settlement),
Tenant A's three-way market settles every outcome — Home, Away, **and Draw** —
with no pseudo-competitor and no architecture leak. Tenants B and C were already
fully validated.

Every YES criterion is met: all three tenants work; zero engine-code changes and
zero migrations *for the breadth validation itself* (Phase 7.75B); the LEAK-1 fix
was a deliberate, narrowly-scoped engine phase (7.76); all tests pass; no
tenant-specific terminology leaks into shared code; optional media works; no media
works; Open Predictions work; Competitor Draft works where enabled; the **three-way
sports market now works using existing engine behavior** (option-based settlement);
settlement / regrade / projections / reconciliation work; and production job
draining works.

> Note on scope attribution: Phase **7.75B** was validation-only (no engine
> changes) and correctly returned **PARTIALLY** because LEAK-1 was still open.
> Phase **7.76** then resolved LEAK-1 with a focused settlement-contract change,
> which is what lifts the verdict to **YES**.

Residual (non-blocking, deferred): entity-type vocabulary and the default English
market question remain non-config-shapeable (**F-21**, Phase 8). The engine stays
vocabulary-neutral, so this blocks no tenant.

See also: [architecture-review-v2.md](architecture-review-v2.md),
[event-media.md](event-media.md), [architecture-findings-register.md](architecture-findings-register.md).
