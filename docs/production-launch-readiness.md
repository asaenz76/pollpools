# Production Launch Readiness Report

**Decision: HOLD — the application is READY; production infrastructure is NOT YET
CONFIGURED (expected at this stage). No production action has been taken.**

Companion to the [Production Launch Runbook](production-launch-runbook.md).

## Scores

| Dimension | Score | Meaning |
|---|---|---|
| **Application readiness** | **GREEN — APP READY** | Every launch-blocking application capability is built, tested, and verified in the repo. One YELLOW: legal copy is draft. |
| **Infrastructure readiness** | **RED — NOT CONFIGURED (by design)** | No production Supabase/Vercel/Resend/Lemon Squeezy/DNS exists yet. This is the intended state before executing the runbook. |

- Migrations: **77** (latest `0077`). Tests: **643 passing**. Typecheck ✅ · Lint ✅ · Build ✅ · Fresh reset ✅ · Types current ✅.

## GO / NO-GO matrix

Status: **GREEN** ready · **YELLOW** ready-with-caveat / needs a decision · **RED** blocking, not yet done.

| Area | Status | Evidence | Owner | Action required | Launch-blocking? |
|---|---|---|---|---|---|
| **Application code** | 🟢 GREEN | 643 tests, typecheck/lint/build green, fresh reset | Eng | none | — |
| **Custom-domain routing** | 🟢 GREEN (app) | `host.ts` + middleware rewrite; curl matrix in `docs/domains.md` | Eng | verify live after DNS (steps 35) | via DNS |
| **Role experiences** | 🟢 GREEN | `docs/role-experience.md`; RX tests | Eng | live smoke (36–38) | live smoke |
| **Event lifecycle / settlement** | 🟢 GREEN | `docs/event-lifecycle.md`; EVT tests | Eng | live smoke (37) | live smoke |
| **Tenant onboarding + publication** | 🟢 GREEN | `docs/tenant-publication.md`; PL.4 tests | Eng | live smoke (14) | — |
| **Competitor visual identity** | 🟢 GREEN | `CompetitorMark`; CV tests | Eng | live smoke (§12) | — |
| **Supabase (prod project)** | 🔴 RED | not created | You | steps 1–6, 19–21 | **YES** |
| **Vercel (prod project)** | 🔴 RED | not created | You | steps 7–10 | **YES** |
| **Resend (email transport)** | 🔴 RED | app ready, unconfigured | You | steps 11–15 | YES if email at launch |
| **Lemon Squeezy (live)** | 🔴 RED | app ready, unconfigured; `manual` until live | You | steps 22–25 | YES if monetized |
| **DNS** | 🔴 RED | not configured | You | steps 16–17, 29–30 | **YES** |
| **SSL** | 🔴 RED | issues after DNS | Vercel | steps 18, 32 | **YES** |
| **Auth (redirect allow-list)** | 🔴 RED | app builds tenant URLs; Supabase must allow | You | step 19, 33 | **YES** |
| **Cron / jobs** | 🟡 YELLOW | `vercel.json` ready; needs `CRON_SECRET` + deploy | You/Eng | steps 9, 44–47 | **YES** |
| **Billing** | 🟡 YELLOW | app ready; live config + one test txn pending | You | steps 22–25, 40–43 | YES if monetized |
| **Email** | 🟡 YELLOW | durable delivery built; real send untested | You | steps 12–15, 39 | YES if email at launch |
| **Domains (tenant records)** | 🔴 RED | `tenant_domains` verification at launch | You | steps 31, 34 | **YES** |
| **Backups / rollback** | 🟡 YELLOW | procedure documented; verify plan/PITR | You | §21 | **YES** |
| **Security** | 🟢 GREEN (app) | RLS, gates, HMAC, mock-404, cron auth, no-demo guard | Eng | final live check (50) | live check |
| **Legal / Support** | 🟡 YELLOW | routes exist; **copy is DRAFT** | You/Legal | supply final copy | **YES for monetized public launch** |
| **Super Admin** | 🔴 RED | created at launch | You | steps 20–21 (+ MFA) | **YES** |
| **Marble tenant** | 🔴 RED | created from Racing template at launch | You/Eng | steps 26–34 | **YES for Marble** |
| **Monitoring** | 🟡 YELLOW | built-in admin visibility; confirm at launch | You | §23 | recommended |

## Remaining RED blockers (all infrastructure — expected)
Production Supabase, Vercel, DNS/SSL, Supabase auth redirect allow-list, tenant-domain verification, production Super Admin, and the Marble tenant. Plus **Resend** and **Lemon Squeezy** if launching with email/monetization. None are application defects.

## Remaining YELLOW risks
1. **Legal copy is draft** — NO-GO for a monetized public launch until final Terms/Privacy/Support text is supplied and approved (a labeled soft/closed launch may proceed at the owner's discretion).
2. **Email + live billing untested end-to-end** — must be validated with a real send and one controlled transaction at launch (runbook steps 14/39 and 40–43).
3. **Backups/PITR** depend on the chosen Supabase plan — confirm before launch.
4. **Rate limiting** — see `docs/security-launch-review.md`: existing guards (auth, per-user tenant cap, prediction idempotency, webhook HMAC, cron secret) classified sufficient for launch; edge/CDN rate limiting recommended as a fast-follow, not a blocker.

## What you must prepare (values / secrets)
Supabase project (URL, anon key, service-role key, DB password) · `APP_SIGNING_SECRET` · `CRON_SECRET` · Resend API key + verified sending domain + `EMAIL_FROM` · Lemon Squeezy live API key + store ID + webhook secret + variant IDs (if monetized) · production Super Admin credentials + MFA device. Store all in a password manager — never in the repo.

## External accounts you must create
Supabase (production project) · Vercel (production project) · Resend · Lemon Squeezy (live) · DNS management for `pollpools.com` and `marblegrandprix.com`.

## Launch-day order (summary)
DB (create → migrate → verify no demo) → Vercel (env → cron → deploy) → email (Resend → SMTP → test) → platform domain (DNS → SSL → auth allow-list → Super Admin + MFA) → billing (live config → webhook, if monetized) → Marble (create from Racing, no demo → brand → competitors → domain → verify → primary) → smoke tests (anon/member/operator/admin, email, billing, jobs, reconciliation=0, growth/health, legal) → backups/security final → **launch**. Full detail: runbook §3.

## Rollback plan
App: promote previous Vercel deployment. Billing: `BILLING_PROVIDER=manual`. Cron: remove/pause. Email: unset transport (delivery safely skips). Domain: un-primary/remove; unverified hosts stop resolving to the tenant. DB: PITR/restore; migrations are forward-fix only. Reconciliation rebuilds derived projections (not a backup).

## Smoke-test checklist (must all pass live)
Anonymous Marble root serves tenant · member participation (no management UI) · operator dashboard + full event lifecycle · super admin `/admin` · self-service tenant → unlisted → publish when eligible · real auth email (correct host) · one live Creator Support txn → webhook once → immutable earnings → Platform Support private (if monetized) · job drain + reconciliation **0 differences** · growth/health jobs · Terms/Privacy/Support reachable · competitor visual identity across surfaces (light/dark, mobile).

## Recommendation

**HOLD — then EXECUTE the runbook when you are ready to provision infrastructure.**

The application is launch-ready (APP READY). Proceed to execute the runbook steps
to configure infrastructure. Before a **monetized public** launch, additionally
resolve the two gating items: **final legal copy** and a **verified live email +
one controlled billing transaction**. A non-monetized soft/closed launch can
proceed once the RED infrastructure items are done, with the draft legal copy
clearly labeled.

No production action has been taken. Awaiting explicit approval to execute.
