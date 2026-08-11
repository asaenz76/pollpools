# Production Launch Runbook — Poll Pools + Marble Grand Prix

**Status: NOT EXECUTED.** This is the controlled launch procedure. No production
infrastructure has been created, no DNS changed, no live billing enabled, no
production email sent, and no production tenant created. Application code is
**APP READY**; every external service below is **INFRA NOT CONFIGURED** until its
step is performed and verified at launch time.

Do not execute this runbook without explicit approval. Execute steps in order;
a step marked **BLOCKING** must pass before continuing.

---

## 0. Verified application baseline (repo state at time of writing)

| Item | Value / status | Evidence |
|---|---|---|
| Branch / HEAD | `pre-launch-hardening` @ `b452eb4` | git |
| Migrations | **77** (latest `0077_template_competitor_visuals.sql`) | `supabase/migrations/` |
| Fresh DB reset | ✅ applies cleanly | `npx supabase db reset` |
| Generated DB types | ✅ current (no diff after `db:types`) | `src/types/database.ts` |
| Typecheck | ✅ pass | `npm run typecheck` |
| Lint | ✅ pass (0 warnings) | `npm run lint` |
| Full test suite | ✅ **643 passing** | `npx vitest run` |
| Production build | ✅ pass | `npm run build` |
| Custom-domain root routing | ✅ APP READY (rewrite + www→primary, PL.1) | `src/lib/tenant/host.ts`, `src/lib/supabase/middleware.ts` |
| Role experiences (member/tenant/super-admin) | ✅ APP READY (RX) | `docs/role-experience.md` |
| Event lifecycle + settlement | ✅ APP READY (EVT) | `docs/event-lifecycle.md` |
| Tenant onboarding (Create Your PollPool) | ✅ APP READY (RX.4) | `src/app/t/[tenantSlug]/start` |
| Tenant publication (unlisted→public) | ✅ APP READY (PL.4) | `docs/tenant-publication.md` |
| Email application readiness | ✅ APP READY, transport unconfigured (PL.3) | `docs/email.md` |
| Billing tenant-domain return URLs | ✅ APP READY (PL.2) | `resolveTenantUrl` |
| Legal/support routes | ⚠️ **DRAFT copy** (pending legal review) | `/terms`, `/privacy`, `/support` |
| Competitor visual identity | ✅ APP READY (CV) | `CompetitorMark` |

> These are verified repo facts; do not restate them as "production ready" — the
> infrastructure that makes them live is created below.

---

## 1. Production topology (target)

One Prediction Engine deployment on Vercel serves both hosts. Tenant identity is
resolved from the host via the authoritative `tenant_domains` model — never
hard-coded.

| Host | Serves | Canonical |
|---|---|---|
| `pollpools.com` | Poll Pools platform | ✅ canonical platform apex |
| `www.pollpools.com` | Poll Pools platform | redirect → `pollpools.com` (Vercel domain redirect) |
| `marblegrandprix.com` | Marble Grand Prix tenant (root serves the tenant) | ✅ canonical (set as tenant primary domain) |
| `www.marblegrandprix.com` | Marble Grand Prix tenant | 308 → `marblegrandprix.com` (app `computeDomainRedirect`) |

`NEXT_PUBLIC_ROOT_DOMAIN=pollpools.com` makes the apex + `www` resolve to the
platform; any other verified dotted host resolves to its tenant.

---

## 2. Secrets you must prepare (never commit any of these)

Generate/collect before launch and store in a password manager (NOT in the repo):

- **Supabase**: production project URL, anon/publishable key, **service-role key**, DB password.
- **`APP_SIGNING_SECRET`**: a fresh 32+ byte random string.
- **`CRON_SECRET`**: a fresh 32+ byte random string.
- **Resend**: API key (`re_…`), verified sending domain, `EMAIL_FROM` address.
- **Lemon Squeezy (live)**: API key, store ID, webhook secret, variant IDs (platform premium, creator support; paid draft only if approved).
- **Production Super Admin** credentials + MFA device.

Server secrets must never be exposed through a `NEXT_PUBLIC_*` variable — the app's
`productionEnvIssues()` classifier fails loudly if one is.

---

## 3. Launch order (51 steps)

Each step: **Where** · **Config/value** · **Verify** · **Rollback** · **Blocking?**

### A. Database (Supabase)

1. **Create production Supabase project.** Where: Supabase dashboard. Value: project name, strong DB password (store securely). Verify: project provisions, is reachable. Rollback: delete project (nothing live yet). **BLOCKING.**
2. **Record project details securely.** Where: password manager. Value: project ref, URL, anon key, service-role key, DB password. Verify: all four stored. Never commit. **BLOCKING.**
3. **Configure required Supabase settings.** Where: Supabase → Auth/Project settings. Value: region (choose closest to users), enable email auth, set password policy. Verify: settings saved. Rollback: revert setting. Blocking: No (later steps depend on redirect URLs — step 19).
4. **Apply all migrations.** Where: local shell against the prod project (`supabase link` then `supabase db push`, or `supabase migration up`). Value: the 77 migrations in `supabase/migrations/`. Verify: `select count(*) from supabase_migrations.schema_migrations;` matches; spot-check `select platform_name from platform_config;` = `Poll Pools` (established by `0074`, no seed needed). Rollback: migrations are forward-only — restore from a fresh project or PITR; never hand-edit applied migrations. **BLOCKING.**
5. **Apply production-safe platform defaults.** Where: covered by migrations (Revenue Plans `0052/0053`, Community Health `0056`, starter templates `0067`, platform_config `0074`). Value: **no dev seed** (`supabase/seed.sql` and `scripts/seed-*.mjs` are DEV-ONLY — do NOT run). Verify: `select count(*) from revenue_plans;` > 0, `select count(*) from tenant_templates where status='published';` = 5, `platform_name='Poll Pools'`. Rollback: n/a. **BLOCKING.**
6. **Verify no demo/test identities or data.** Where: prod DB. Value/Verify: `select count(*) from users where email like '%@pollpools.test' or email like '%@marblegp.test';` = 0; no tenant slug `marbles`; no predictions/orders/payouts. Also confirm build/start scripts never seed (guarded by `tests/unit/production-safety.test.ts`). Rollback: delete any stray row. **BLOCKING.**

### B. Hosting (Vercel)

7. **Create production Vercel project.** Where: Vercel. Value: connect the repo, set the production branch (`main` after this branch merges). Verify: project created. Rollback: delete project. **BLOCKING.**
8. **Configure production environment variables.** Where: Vercel → Settings → Environment Variables (Production scope only). Values — see `docs/environment.md`:
   - **Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL=https://pollpools.com`, `NEXT_PUBLIC_ROOT_DOMAIN=pollpools.com`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SIGNING_SECRET`, `CRON_SECRET`, `BILLING_PROVIDER=manual` (until Lemon Squeezy is live — do NOT use `mock`).
   - **Optional (add when configured):** `RESEND_API_KEY`, `EMAIL_FROM`, `LEMON_SQUEEZY_*`, `BILLING_WEBHOOK_SECRET`.
   Verify: no server secret is in a `NEXT_PUBLIC_*` var; `productionEnvIssues()` (readiness route, step 10) returns no errors. Rollback: edit vars. **BLOCKING.**
9. **Configure Vercel cron.** Where: `vercel.json` (already committed) auto-registers 4 crons: `/api/internal/jobs/drain` (every min), `/api/internal/projections/monitor` (*/5), `/api/internal/growth/evaluate` (06:00), `/api/internal/growth/health-snapshot` (05:00). Value: `CRON_SECRET` set (step 8). Verify: crons listed in Vercel; a manual `GET /api/internal/jobs/drain` **without** the secret returns 401/503 (not open). Rollback: remove crons / disable. **BLOCKING** (jobs won't drain otherwise).
10. **Deploy initial production build.** Where: Vercel. Verify: build succeeds; `GET https://<vercel-url>/` renders the platform landing; check for runtime errors in logs. Rollback: Vercel "Promote previous deployment". **BLOCKING.**

### C. Auth email (Resend + Supabase SMTP)

11. **Create/configure Resend.** Where: Resend dashboard. Value: account, API key. Verify: key created. Never commit. See `docs/email.md`.
12. **Verify sending domain.** Where: Resend + DNS. Value: SPF, DKIM records (Resend-provided), DMARC recommended. Verify: Resend shows the domain **Verified**. **BLOCKING for any email.**
13. **Configure Supabase custom SMTP.** Where: Supabase → Auth → SMTP. Value: Resend SMTP host/port/user + API key as password, sender = `EMAIL_FROM`. Verify: settings saved. Rollback: disable custom SMTP (falls back to Supabase's limited built-in). Blocking: Yes for auth email.
14. **Test real auth email.** Where: prod. Value: trigger a password reset for a throwaway real inbox. Verify: email arrives, correct sender, link host = `pollpools.com`. **BLOCKING** — do not claim auth email works until this passes.
15. **Configure application Resend transport.** Where: Vercel env. Value: `RESEND_API_KEY`, `EMAIL_FROM`; optionally set `platform_config.email_delivery_enabled=true` to enable notification emails (per-user `email_enabled` stays opt-in). Verify: `docs/email.md` smoke test (step 19 below). Rollback: unset — delivery then safely SKIPS. Blocking: No (email is an optional channel).

### D. Platform domain (pollpools.com)

16. **Configure Poll Pools DNS.** Where: your DNS provider. Value: the A/CNAME records **Vercel provides** for `pollpools.com` + `www` (do not invent values). Verify: DNS resolves. Blocking: Yes for platform host.
17. **Attach `pollpools.com` + `www` to Vercel.** Where: Vercel → Domains. Value: add both; set `www`→apex redirect. Verify: both listed, apex primary. Rollback: remove domain. **BLOCKING.**
18. **Verify SSL.** Where: Vercel. Verify: certificates **Issued** for both; `https://pollpools.com` loads. Rollback: n/a (re-issue). **BLOCKING.**
19. **Configure Supabase Auth Site URL / redirect allowlist.** Where: Supabase → Auth → URL Configuration. Value: Site URL `https://pollpools.com`; **Redirect allow-list** (Supabase wildcard syntax):
    - `https://pollpools.com/**`
    - `https://www.pollpools.com/**`
    - `https://marblegrandprix.com/**`
    - `https://www.marblegrandprix.com/**`
    Verify: sign-up confirmation + reset links resolve to allowed hosts. **This is INFRA, not app** — application code builds tenant-primary return URLs (`resolveTenantHomeUrl`), but Supabase must allow them. **New future tenant domains must be added here** — document this as the standing process (see `docs/domains.md`). **BLOCKING.**
20. **Create production Super Admin.** Where: prod DB / Supabase Auth. Value: create the auth user, then `insert into user_roles (user_id, role, tenant_id) values ('<uid>', 'super_admin', null);`. Verify: `/admin` renders for that user; 404 for others. Rollback: delete the role row. **BLOCKING.**
21. **Enable MFA for the Super Admin.** Where: Supabase Auth MFA / account. Verify: MFA enrolled. Strongly recommended before any privileged action. Blocking: Recommended (treat as BLOCKING for a public launch).

### E. Live billing (Lemon Squeezy) — only if approved

22. **Configure Lemon Squeezy Live.** Where: Lemon Squeezy dashboard + Vercel env. Value: `BILLING_PROVIDER=lemon_squeezy`, `LEMON_SQUEEZY_TEST_MODE=false`, `LEMON_SQUEEZY_API_KEY`, `LEMON_SQUEEZY_STORE_ID`, live variant IDs (`LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID`, `LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID`). **Never use test-mode IDs in production.** `PAID_DRAFT_CHECKOUT_ENABLED` stays `false` unless separately approved (and requires a `provider_product_approvals` row). Verify: `productionEnvIssues()` returns no billing errors. Rollback: set `BILLING_PROVIDER=manual`. Blocking: Only if launching monetized.
23. **Create the live webhook endpoint + secret.** Where: Lemon Squeezy → Webhooks. Value: URL `https://pollpools.com/api/webhooks/lemon-squeezy`, `LEMON_SQUEEZY_WEBHOOK_SECRET` (set the same value in Vercel). Verify: endpoint saved. **BLOCKING if billing live.**
24. **Verify webhook signature processing.** Where: send a test event from Lemon Squeezy. Verify: 2xx; an event with a bad signature is rejected (HMAC, constant-time). Rollback: rotate secret. **BLOCKING if billing live.**
25. **Enable production billing configuration.** Where: confirm `LEMON_SQUEEZY_TEST_MODE=false` and billing products exist in `billing_products`. Verify: a checkout can be created (step 40). Rollback: `manual`. Blocking: Only if monetized.

### F. Marble Grand Prix tenant

26. **Create Marble Grand Prix from the Racing template, WITHOUT demo data.** Where: `/admin/templates/<racing-version>/new-tenant` (super-admin), or `select public.create_tenant_from_template('<racing_version_id>', '{"slug":"marbles","display_name":"Marble Grand Prix","locale":"en","timezone":"UTC"}'::jsonb, '{}'::jsonb, false, null);` — **`p_include_demo=false`**. Verify: tenant exists, `listed` per policy (admin-created defaults listed=true), auto-assigned Revenue Plan present, **no demo predictions/events**. Rollback: delete the tenant. No Marble special-casing in the engine. **BLOCKING.**
27. **Configure branding/theme/vocabulary/features.** Where: `/admin/tenants/<id>` + `tenant_settings`/`tenant_feature_flags`. Value: light+dark logo, brand colors (theme), vocabulary (competitor="marble"), features (draft on/off, creator support, media optional). Verify: `marblegrandprix`-branded UI renders; media stays optional; YouTube not required. Rollback: revert settings. Blocking: Yes for a branded launch.
28. **Add real competitors (with visual identity).** Where: creator competitors page or admin. Value: real marbles — single-color, multicolor (2–4), numbered, multicolor+identifier. Verify: `CompetitorMark` renders each (step 12 below). Rollback: edit/remove. Blocking: Yes.
29. **Configure Marble domain records.** Where: DNS. Value: Vercel-provided records for `marblegrandprix.com` + `www`. Verify: DNS resolves. **BLOCKING.**
30. **Attach `marblegrandprix.com` + `www` to Vercel.** Where: Vercel → Domains (same project). Verify: both listed. Rollback: remove. **BLOCKING.**
31. **Complete tenant-domain ownership verification.** Where: `/admin/tenants/<id>/domains` (DNS-TXT verification) → creates verified `tenant_domains` rows. Value: add `marblegrandprix.com` (primary) + `www.marblegrandprix.com`. Verify: both `verified=true`. **BLOCKING** — unverified domains do not resolve to the tenant (fail-safe).
32. **Verify SSL** for both Marble hosts in Vercel. Verify: Issued; `https://marblegrandprix.com` loads. **BLOCKING.**
33. **Add required auth redirect destinations** for Marble hosts to the Supabase allow-list (already added in step 19). Verify: sign-in on `marblegrandprix.com` returns to `marblegrandprix.com`. **BLOCKING.**
34. **Set Marble primary domain.** Where: `/admin/tenants/<id>/domains` → mark `marblegrandprix.com` primary. Verify: `www.marblegrandprix.com/x?q=1` → 308 → `https://marblegrandprix.com/x?q=1` (path+query preserved). Rollback: change primary. **BLOCKING.**

### G. Smoke tests (verify the live system)

35. **Anonymous Marble experience.** `marblegrandprix.com/` serves the Marble tenant home (NOT the platform directory); event/leaderboard load; browser URL stays clean (no `/t/marbles`). **BLOCKING.**
36. **Member experience.** Sign in on Marble → lands in participation; predict; Draft (if enabled); leaderboard; notifications; **no management UI**. **BLOCKING.**
37. **Tenant operator experience.** Sign in as the Marble operator → Tenant Dashboard; create/edit/lock/settle/correct an event; cancel a second event; Growth + Community Health + Success Timeline visible; revenue tenant-scoped; **Platform Support absent**. **BLOCKING.**
38. **Super Admin.** Sign in on `pollpools.com` → `/admin`; tenant health, jobs, reconciliation, templates, growth, payouts/billing ops, moderation, domains. **BLOCKING.**
39. **Real auth email on Marble** — password reset from `marblegrandprix.com` arrives, links to `marblegrandprix.com`. **BLOCKING if email required.**
40. **One controlled live Creator Support transaction** (only if billing approved) — see §15. **BLOCKING if monetized.**
41. **Verify webhook** delivered + processed once (no duplicate effect). **BLOCKING if monetized.**
42. **Verify immutable earnings record** (`creator_earnings`) with the correct creator share. **BLOCKING if monetized.**
43. **Verify payout state** (`creator_payout_requests` flow available). Blocking: No (payout is post-launch).
44. **Verify job queue drains** — settle an event, confirm `system_jobs` drains, no dead-letters. **BLOCKING.**
45. **Verify reconciliation = zero differences** — `select public.reconcile('<tenant>', 'tenant', null, 'dry_run', gen_random_uuid()::text);` → `differences_found = 0`. Any drift = **NO-GO**. **BLOCKING.**
46. **Verify Growth evaluation** — `/api/internal/growth/evaluate` (with CRON_SECRET) runs; plan state sane. **BLOCKING.**
47. **Verify Community Health snapshot** — `/api/internal/growth/health-snapshot` runs; snapshot written; coaching only (never gates plans). **BLOCKING.**
48. **Verify Terms / Privacy / Support** at `pollpools.com/terms|privacy|support`. ⚠️ Copy is **DRAFT (pending legal review)** — see §20. **BLOCKING for monetized public launch until final legal copy is supplied.**
49. **Verify backups / monitoring / rollback readiness** — see §21, §23. **BLOCKING.**
50. **Final security check** — see §22. **BLOCKING.**
51. **Launch** — announce, monitor closely for the first hours.

---

## 4. Supabase production checklist
Project creation · region (nearest users) · DB password in password manager · apply 77 migrations · verify RLS enabled on all tenant tables (spot-check `select relname, relrowsecurity from pg_class where relname in ('predictions','creator_earnings','tenant_settings');`) · email auth on · custom SMTP (Resend) · redirect allow-list (step 19) · PITR/backups available on the chosen plan · service-role key only in server env · production Super Admin (`user_roles`) · MFA. No real secrets in the repo.

## 5. Vercel production checklist
Connect repo · production branch · Next.js build (`next build`) · env vars (Production scope) · sensitive vars not in `NEXT_PUBLIC_*` · crons registered (`vercel.json`) · domains attached · `www`→apex redirect · SSL issued · **preview vs production isolation: Preview deployments must NOT carry live billing** — set `BILLING_PROVIDER`/`LEMON_SQUEEZY_TEST_MODE` per-environment so Preview stays `manual`/test; mock billing is hard-disabled by `NODE_ENV=production` regardless.

## 6. Resend checklist
Account · sending-domain verification (SPF + DKIM; DMARC recommended) · sender identity (`EMAIL_FROM`) · reply-to · API key in server env only · Supabase custom SMTP wired · application transport (`RESEND_API_KEY`+`EMAIL_FROM`) · test auth email · test one notification email · verify a failure marks `notification_deliveries.status='failed'` and retries. Do not claim delivery before a real send. See `docs/email.md`.

## 7. Lemon Squeezy live checklist
Live Mode ON · live API key · live store/product/variant IDs (never test IDs) · webhook `https://pollpools.com/api/webhooks/lemon-squeezy` + secret · Creator Support + Premium products exist · **Paid Draft stays disabled** unless approved (`PAID_DRAFT_CHECKOUT_ENABLED` + `provider_product_approvals`) · refunds via provider · payout flow reviewed · tenant-aware return URLs (`resolveTenantUrl`, verified in `tenant-return-urls.test.ts`).

## 8. Domain + SSL checklist (per host)
For `pollpools.com`, `www.pollpools.com`, `marblegrandprix.com`, `www.marblegrandprix.com`: add to Vercel · create the **Vercel-provided** DNS records (do not invent values) · verify · SSL issued · set canonical/primary · redirect behavior (`www`→apex platform; `www`→primary tenant via app) · for tenant hosts, add the verified `tenant_domains` row and set primary · fail-safe: unverified/unknown hosts never resolve to a tenant. See `docs/domains.md`.

## 9. Auth domain checklist
sign-up · sign-in · password reset · email verification · magic link (if enabled) · OAuth (if enabled) · logout · safe return paths (`safeReturnPath`, open-redirect-tested). Specifically: a Marble user who begins on `marblegrandprix.com` stays on `marblegrandprix.com` through auth (host-relative redirects + tenant-primary email URLs). No bounce to Poll Pools.

## 10. Production seed strategy
**Production receives:** migrations only (`supabase migration up`) → schema + Revenue Plans + Community Health definitions + starter Tenant Templates + supported engine versions + `platform_config` defaults (`platform_name='Poll Pools'`). **Production must NOT receive:** `supabase/seed.sql`, `scripts/seed-demo.mjs`, `scripts/seed-test-users.mjs`, `scripts/seed-operator` — all DEV-ONLY. No test users, known passwords, demo tenants, demo predictions, fake billing/payouts. Guard: `tests/unit/production-safety.test.ts` proves no migration/build path carries a test identity.

## 11. Marble Grand Prix creation plan
Create from the **Racing** template with `p_include_demo=false`. Then set: display name "Marble Grand Prix", slug `marbles`, theme (light+dark logo, colors), vocabulary (marble), Draft on/off, media optional, Creator Support (if enabled), Revenue Plan (auto-assigned — tenants never choose), real competitors with colors + identifiers, first competition, first event, custom domain (steps 29–34), owner/operator account. **No engine special-casing for Marble.**

## 12. Marble visual identity smoke test
Create competitors covering: single-color; 2-color; 4-color; numbered (e.g. "8"); multicolor+identifier. Verify `CompetitorMark` renders each on: prediction cards · Draft · event · result picker · competitor list · mobile (320/375/390) · light + dark. Legacy single-color competitors must still render their color.

## 13–19. Role / publication / billing / jobs / reconciliation / growth / email smoke tests
Covered by steps 35–47 and the readiness report's smoke-test checklist. Reconciliation dry-run **must** be 0 differences (else NO-GO).

## 20. Legal / support
`/terms`, `/privacy`, `/support` exist and are footer-linked. **Copy is DRAFT, explicitly marked "pending final legal review."** Do not treat placeholder copy as final: **NO-GO for a monetized public launch until final legal text is supplied and approved.** A non-monetized soft/closed launch may proceed at the owner's discretion with the draft clearly labeled.

## 21. Backup / recovery checklist
Confirm Supabase backups/PITR on the chosen plan · known restore procedure · previous Vercel deployment available for instant rollback · cron can be disabled fast (remove from `vercel.json` or pause project) · live billing can be disabled fast (`BILLING_PROVIDER=manual`) · a tenant domain can be un-primaried/removed fast · app rollback = "Promote previous deployment" · migration recovery = forward-fix only (never edit an applied migration); reconciliation (`public.reconcile`) rebuilds derived projections from authoritative grades but is **not** a database backup — the two are distinct.

## 22. Security final check
RLS on all tenant tables · tenant isolation (cross-tenant tests green) · Super Admin gates (`requireSuperAdmin` in `/admin` layout + every admin loader/action) · webhook HMAC + constant-time compare · billing idempotency · **mock billing hard-404 in production** (`mockBillingUnavailable` = `NODE_ENV==='production'`) · Paid Draft gate off · `CRON_SECRET` required (cron endpoints 401/503 without it) · open-redirect protection (`safeReturnPath`) · domain verification required · email/API secrets server-only, never `NEXT_PUBLIC_*` · no test users / known passwords in prod · no dev bypass / debug route · rate-limit decisions documented in `docs/security-launch-review.md`.

## 23. Monitoring checklist
Reuse the built-in Super Admin operational visibility (no new vendor required): projection health + dead-letters + reconciliation (`/admin`, `projection_health`, `projection_job_stats`) · job failures (`system_jobs` status='dead') · webhook failures (`webhook_processing_status`) · email failures (`notification_deliveries` status='failed') · cron via Vercel logs/cron dashboard · domain/SSL via Vercel · billing via Lemon Squeezy dashboard. Optionally add Vercel/Supabase log drains.

---

See the companion **[Production Launch Readiness Report](production-launch-readiness.md)** for the GO/NO-GO matrix and recommendation.
