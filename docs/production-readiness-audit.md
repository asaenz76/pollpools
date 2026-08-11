# Production Readiness Audit — Prediction Engine

**Status: READ-ONLY audit. Nothing was deployed, changed, or provisioned.**
Scope: what must be prepared before the first production deployment and the first
real tenant (Marble Grand Prix). Topology: `pollpools.com` = platform,
`marblegrandprix.com` = Marble tenant, `www.marblegrandprix.com` → redirect.

> **Guiding rule applied throughout:** "app support exists" ≠ "production
> infrastructure is configured." Each item separates **BUILT-IN-APP** from
> **REQUIRES-INFRA-CONFIG**.

---

## 1. Executive summary

The **application layer is mature and launch-grade**: 67 migrations reproducible
from source control, 554 passing tests, comprehensive RLS (81 policies), HMAC +
constant-time webhook verification, idempotent billing, hard production guards on
mock billing, CRON-secret-protected scheduled endpoints, and an atomic
template-based tenant creation path.

The **production infrastructure is essentially unconfigured** (expected at this
stage), and there is **one genuine application blocker** for the intended domain
topology:

- 🔴 **Custom-domain root routing is not wired.** The data model, DNS-TXT
  verification, redirect-to-primary, and `host → tenant` header resolution all
  exist, but there is **no middleware rewrite** mapping a custom domain's `/*` to
  the tenant's pages. As written, `marblegrandprix.com/` renders the **platform
  directory** (`src/app/page.tsx`), not the Marble tenant. This must be built
  before `marblegrandprix.com` can serve Marble.
- 🔴 **Production email is not configured.** No Resend integration exists; the
  `EmailNotificationProvider` is a generic HTTP adapter that is **not wired to any
  delivery worker**, and Supabase custom SMTP is commented out. Auth emails
  (verification, password reset) would use Supabase's built-in dev mailer.
- 🟡 **Billing return URLs** always point at the platform URL, not the tenant's
  primary domain.

Everything else is standard launch configuration (Supabase project, Vercel env,
DNS/SSL, Lemon Squeezy live mode, super-admin creation).

## 2. Current readiness score

| Layer | Score |
| --- | --- |
| Application code / logic | **9.0 / 10** — feature-complete, tested, secure |
| Production infrastructure | **2.0 / 10** — not yet provisioned (expected) |
| Domain/tenant serving | **4.0 / 10** — model built, **root rewrite missing** |
| **Overall launch readiness** | **~4.5 / 10** — blocked on ~1 app change + infra setup |

Estimated work to first production tenant: **~1 focused engineering day of app
work** (custom-domain rewrite + billing/auth return polish + EMAIL env wiring)
**plus infra provisioning** (Supabase project, Vercel, DNS/SSL, Resend, Lemon
Squeezy live).

---

## 3. Environment-variable inventory

Source of truth: `src/lib/env.ts` (Zod-validated). Secrets are never printed.

| Variable | Purpose | Local | Preview | Prod | Secret | Validation | If missing |
| --- | --- | :-: | :-: | :-: | :-: | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Absolute links, platform base URL | ✓ | ✓ | ✓ | No | url, default `http://localhost:3000` | Falls back to localhost (**wrong in prod** → must set to `https://pollpools.com`) |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Subdomain tenant resolution | ✓ | ✓ | ✓ | No | min(1), default `localhost:3000` | Subdomain routing breaks; must be `pollpools.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API | ✓ | ✓ | ✓ | No | url, **required** | Build/parse fails |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public client key | ✓ | ✓ | ✓ | No (public) | min(1), **required** | Build/parse fails |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS-bypass server ops | ✓ | ✓ | ✓ | **Yes** | min(1), **required** | `serverEnv()` throws |
| `APP_SIGNING_SECRET` | Step-up / idempotency token signing | ✓ | ✓ | ✓ | **Yes** | min(1), **required** | `serverEnv()` throws |
| `CRON_SECRET` | Auth for internal scheduled endpoints | opt | ✓ | ✓ | **Yes** | optional | Endpoints return **503** (never open) |
| `ALLOW_INTEGRATION_TEST_SKIP` | Let tests skip w/o DB | ✓ | — | — | No | default `false` | CI can't silently skip |
| `BILLING_PROVIDER` | `lemon_squeezy`\|`mock`\|`manual` | ✓ | ✓ | ✓ | No | enum, default `mock` | Defaults to mock (**must be `lemon_squeezy` in prod**) |
| `PAID_DRAFT_CHECKOUT_ENABLED` | Paid Draft gate | ✓ | ✓ | ✓ | No | default `false` | Paid draft stays OFF (**keep false**) |
| `BILLING_WEBHOOK_SECRET` | Mock/internal signing | ✓ | ✓ | ✓ | **Yes** | default `local-…-change-me` | **Dev default is insecure — must override** |
| `LEMON_SQUEEZY_API_KEY` | LS API | — | test | **live** | **Yes** | optional | LS calls fail |
| `LEMON_SQUEEZY_STORE_ID` | LS store | — | test | **live** | No | optional | LS calls fail |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | LS webhook HMAC | — | test | **live** | **Yes** | optional | Webhook verification fails |
| `LEMON_SQUEEZY_TEST_MODE` | test vs live | ✓ | true | **false** | No | default `true` | **Defaults to test — must be `false` in prod** |
| `LEMON_SQUEEZY_*_VARIANT_ID` (×3) | Product variants | — | test | **live** | No | optional | Checkout can't resolve product |
| `EMAIL_API_ENDPOINT` / `EMAIL_API_KEY` / `EMAIL_FROM` | Email NotificationProvider transport | — | — | (opt) | **Yes** (key) | **NOT in env.ts / .env.example** — read directly in `src/lib/providers/email.ts` | Provider reports "unconfigured" → **email is skipped** |
| `NODE_ENV` | Runtime mode | auto | auto | `production` | No | — | Mock billing guard keys off this |

**Findings:** `EMAIL_*` vars are undocumented (not in `env.ts` or `.env.example`).
`BILLING_WEBHOOK_SECRET` ships an insecure dev default. `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_ROOT_DOMAIN`, `BILLING_PROVIDER`, `LEMON_SQUEEZY_TEST_MODE` all have
dev-safe defaults that are **wrong for production** and must be explicitly set.

---

## 4. Production Supabase checklist

**BUILT-IN-APP (reproducible from source):**
- 67 migrations `0001`–`0067` apply cleanly to an **empty** database (verified by
  the repeated `db:reset` gate in every phase). Production must be built from
  migrations, **not** a copy of the dev DB.
- Extensions used: `pgcrypto` (gen_random_uuid) — created by migration `0001`.
- Platform config/data is **migration-seeded** (reproducible): `platform_config`
  (`0031`), Revenue Plans + shares + default assignment (`0053`), Community Health
  metrics + bands (`0056`), 5 starter templates (`0067`).
- RLS enabled on all tenant tables (81 `enable row level security` statements).
- Generated types (`src/types/database.ts`) regenerate cleanly.

**REQUIRES-INFRA-CONFIG:**
1. Create a fresh production Supabase project (dedicated; do not reuse dev).
2. Set the DB password + capture project URL, anon key, service-role key.
3. Run migrations against it (`supabase db push` / linked project), **not** a dump.
4. Configure **Auth** (§5, §3) and **custom SMTP** (§4).
5. Regenerate types against prod (should be a no-op vs committed types).
6. Do **not** run `supabase/seed.sql` or `scripts/seed-demo.mjs` in prod (dev/demo
   data). See §15 for the minimum production seed.

**Exact setup sequence:** create project → set env locally to prod → `supabase link`
→ `supabase db push` → verify migration count = 67 → set platform brand
(`platform_name`) → configure Auth URLs + SMTP → create super admin (§14).

---

## 5. Supabase Auth (multi-domain)

**Current state:** `supabase/config.toml` has `site_url = http://127.0.0.1:3000`
and `additional_redirect_urls = ["https://127.0.0.1:3000"]` (local). Auth-redirect
construction is already **safe and tenant-domain-aware**:
- `resolveTenantHomeUrl` (used by sign-up confirmation + password reset) returns the
  tenant's **verified primary custom domain** if present, else
  `NEXT_PUBLIC_APP_URL/t/{slug}`. Built from the slug/DB — **never** a client URL.
- `safeReturnPath` rejects absolute/protocol-relative return targets.
- In-app `redirect()` after sign-in/out uses the relative `/t/{slug}` path.

**REQUIRES-INFRA-CONFIG (🔴 blocks multi-domain auth):**
- In the Supabase **dashboard** (production), set `Site URL = https://pollpools.com`
  and add to the **redirect allowlist**: `https://pollpools.com/**`,
  `https://marblegrandprix.com/**`, `https://www.marblegrandprix.com/**`, and a
  pattern for future tenant domains. Supabase only redirects to **allow-listed**
  URLs — `resolveTenantHomeUrl` returning `https://marblegrandprix.com/` will fail
  unless that origin is allow-listed.
- Configure **custom SMTP** (§4) or auth emails use the rate-limited built-in mailer.
- Decide email confirmation / password policy (`minimum_password_length` is 6 in
  dev config; consider ≥8 for prod).

**Interaction with the §8 rewrite gap:** even once auth redirects to
`marblegrandprix.com/`, the tenant only renders there after the custom-domain
rewrite is built.

---

## 6. Resend / Email

**BUILT-IN-APP:** `EmailNotificationProvider` (Phase 8-C) behind the
`NotificationProvider` interface — injectable transport, an HTTP-API env transport
(`createHttpEmailTransport`, generic `EMAIL_API_*`), and an in-memory test
transport. Failure handling + skip-when-unconfigured are unit-tested.

**NOT production-ready (be strict):**
1. **No Resend integration exists.** The transport is a generic HTTP POST adapter,
   not Resend-specific. There are **no live credentials and no verified sending
   domain**, so live delivery has **never been tested** (by design).
2. **The email provider is not wired to any delivery worker.** All application
   notifications (Growth plan changes, health bands, WAU milestones, social) are
   **in-app rows only** (created by SQL triggers). Nothing currently sends them as
   email. Wiring a worker that reads pending notifications → `deliver()` is unbuilt.
3. **Supabase Auth emails** (sign-up confirmation, password reset) are sent by
   **Supabase**, not this app. In prod they need **custom SMTP** (Resend) configured
   in the Supabase dashboard — the built-in mailer is not a production sender.

**Recommendation:** verify a dedicated sending subdomain (e.g. `mail.pollpools.com`)
in Resend; obtain the SPF/DKIM/DMARC records **from Resend** (do not invent values)
and add them at the DNS provider. Use Resend for (a) Supabase Auth custom SMTP and
(b) — if/when needed — the app email transport (`EMAIL_API_ENDPOINT`/`_KEY`/`_FROM`,
or a small Resend adapter). **Application email is optional for launch** (all
notifications work in-app); **auth email is required** (password reset/verification).

---

## 7. Lemon Squeezy production

**BUILT-IN-APP:** `LemonSqueezyProvider` behind the `BillingProvider` interface;
HMAC-SHA256 webhook verification with constant-time compare; idempotent
`apply_billing_event` (on `provider` + `provider_event_id`); immutable
`creator_earnings` ledger; manual payouts; `LEMON_SQUEEZY_TEST_MODE` flag. Grants
happen **only** via signature-verified webhooks.

**REQUIRES-INFRA-CONFIG:**
- Create products/variants in **Live mode** and capture **live** `API_KEY`,
  `STORE_ID`, `WEBHOOK_SECRET`, and the 3 variant IDs. **Test-mode IDs must never be
  promoted to prod.** Set `LEMON_SQUEEZY_TEST_MODE=false`, `BILLING_PROVIDER=lemon_squeezy`.
- Register the **production webhook URL**: `https://pollpools.com/api/webhooks/lemon-squeezy`
  (the platform origin; webhooks are platform-level, not per-tenant domain).
- Products required in Live mode: Platform Premium, Creator Support (paid Draft
  variant only if that gate is ever enabled).
- **Paid Competitor Draft** stays **OFF** (`PAID_DRAFT_CHECKOUT_ENABLED=false`) —
  do not change; production approval requirements remain.
- **Return-URL gap (🟡):** checkout `redirect_url` and the billing status return use
  `NEXT_PUBLIC_APP_URL/t/{slug}/billing` (platform origin), **not** the tenant's
  primary domain. A Marble purchase started on `marblegrandprix.com` returns to
  `pollpools.com/t/marbles/billing`. Safe (validated, slug-derived) but off-domain;
  see §12.

---

## 8. Cron / background jobs

All four are in `vercel.json` and authenticated by `authorizeCron` (Bearer
`CRON_SECRET`, constant-time, **503 if unset — never open**). No production
workflow depends on a manual worker.

| Path | Schedule | Auth | Idempotent | On failure | Monitoring |
| --- | --- | --- | --- | --- | --- |
| `/api/internal/jobs/drain` | `* * * * *` (1 min) | CRON_SECRET | Yes (durable worker lease) | Returns 500; dead-letters bad jobs | JSON logs + `projection_health` |
| `/api/internal/projections/monitor` | `*/5 * * * *` | CRON_SECRET | Yes | Requeues actionable failures | `projection_health` |
| `/api/internal/growth/evaluate` | `0 6 * * *` | CRON_SECRET | Yes | 500 | audit + logs |
| `/api/internal/growth/health-snapshot` | `0 5 * * *` | CRON_SECRET | Yes (daily upsert) + timeline detect | 500 | snapshots table |

**REQUIRES-INFRA-CONFIG:** set `CRON_SECRET` in Vercel prod; confirm Vercel Cron is
enabled on the plan (Hobby has limits — verify the 1-minute drain is allowed, else
raise the interval). Success Timeline detection is folded into health-snapshot
(covered).

---

## 9. Custom-domain production architecture & SSL

**BUILT-IN-APP:** `tenant_domains` (type / DNS-TXT verification / ssl_status /
one-primary index); `resolveTenantRef` (path / subdomain / custom-domain);
header-stamping middleware; **redirect of verified non-primary → primary (308)**;
`host → tenant` lookup in `getTenantContext` for verified domains; a super-admin
domain-management UI with real DNS-TXT verification; auth return-URL binding to the
primary domain.

**🔴 MISSING (application) — the blocker:** there is **no rewrite** of a custom
domain's request path to the tenant's pages. Tenant pages live under
`/t/[tenantSlug]/**`; `getTenantContext` is only consumed there. The root route
`src/app/page.tsx` is the **platform directory** and never resolves a tenant from
the host. Result: `marblegrandprix.com/` serves the platform landing, and the
`{kind:"domain"}` resolution path is effectively unreachable for serving a tenant
at its own root. **A middleware rewrite (`custom-domain /*` → `/t/{slug}/*`, using
the already-resolved tenant header) must be added.** This is the clearest
"app-support-exists but not production-functional" item.

**REQUIRES-INFRA-CONFIG (Vercel/DNS/SSL — distinct from the app):**
| Concern | Built in app | Requires Vercel/DNS |
| --- | --- | --- |
| Domain attachment | — | Add `pollpools.com`, `www.pollpools.com`, `marblegrandprix.com`, `www.marblegrandprix.com` in Vercel |
| DNS records | — | Set apex A / `www` CNAME to the values **Vercel provides** (do not hard-code) |
| SSL issuance | records `ssl_status` (app-layer) | Vercel auto-provisions certs after DNS resolves |
| App-layer domain verification | DNS-TXT `_pe-verify` flow ✓ | Tenant admin adds TXT, clicks Verify |
| Primary redirect | 308 non-primary→primary ✓ | + configure `www`→apex redirect at Vercel/DNS |
| Host→tenant mapping | resolver + lookup ✓ | insert the verified `tenant_domains` row |

Vercel's own flow separates **adding** a domain from **configuring/verifying DNS** —
mirror that: attach in Vercel, then set DNS from Vercel's values, then wait for SSL,
then verify in the tenant admin, then (after the rewrite ships) test serving.

## 10. Marble Grand Prix domain test plan (post-provisioning)

Only runnable **after** the §9 rewrite + Vercel/DNS/SSL. Verify: `https://marblegrandprix.com`
serves the Marble tenant home (not the platform directory); `https://www.marblegrandprix.com`
**308-redirects** to the apex; branding/light-dark logo/vocabulary (Races/Marbles)/
theme render; events + prediction flow + creator flow + Growth dashboard work;
canonical + share URLs use `marblegrandprix.com`; footer shows "Powered by Poll
Pools" only if `show_powered_by` is true; no PollPools branding where the tenant
hides it; no console errors.

## 11. Auth on Marble Grand Prix

After §5 allowlist + §8 rewrite: sign-up, sign-in, sign-out, password reset, email
verification must all **start and return on `marblegrandprix.com`**. `resolveTenantHomeUrl`
already targets the primary domain (good); the in-app post-sign-in `redirect('/t/{slug}')`
must be validated on a custom domain once the rewrite exists (it should resolve via
the rewrite, but verify it doesn't bounce to `pollpools.com`). No user should land
on `pollpools.com` after authenticating on the Marble domain.

## 12. Billing domain returns

**🟡 Gap:** `returnUrl()` and checkout `redirect_url` use `NEXT_PUBLIC_APP_URL`
(platform), not the tenant primary domain. For a Marble transaction to return to
`marblegrandprix.com`, apply the same treatment as auth (resolve the tenant's
primary domain) in `src/lib/domain/billing-actions.ts`. Return URLs remain
validated/slug-derived (never arbitrary) — this is a correctness/UX gap, not a
security hole. Applies to Creator Support, Premium, customer portal, and (future)
Draft checkout.

---

## 13. Production secrets checklist

Put in **Vercel Sensitive Environment Variables** (encrypted, not readable after
set): `SUPABASE_SERVICE_ROLE_KEY`, `APP_SIGNING_SECRET`, `CRON_SECRET`,
`BILLING_WEBHOOK_SECRET`, `LEMON_SQUEEZY_API_KEY`, `LEMON_SQUEEZY_WEBHOOK_SECRET`,
`EMAIL_API_KEY` (if app email is wired). Plain env (non-secret):
`NEXT_PUBLIC_*` (public by design), `NEXT_PUBLIC_ROOT_DOMAIN`, `BILLING_PROVIDER`,
`LEMON_SQUEEZY_STORE_ID` + variant IDs, `LEMON_SQUEEZY_TEST_MODE=false`,
`PAID_DRAFT_CHECKOUT_ENABLED=false`, `NODE_ENV=production` (Vercel sets this).
**Never** prefix a secret with `NEXT_PUBLIC_`. **Preview** env must use
**test**-mode Lemon Squeezy and a **non-production** Supabase/service-role — never
production billing or production service-role in Preview.

## 14. Super Admin production access

`super_admin` is a `user_roles` row (`role='super_admin'`, `tenant_id=null`). The
only current grant path is `scripts/seed-demo.mjs` (**dev only**, uses a demo
password — must never run in prod). Plan: (1) create the real admin user via
Supabase Auth (strong password / invite); (2) insert the `user_roles` grant via a
one-off SQL run against prod; (3) enable **MFA** for that account in Supabase; (4)
verify via audit log; (5) first-login smoke test of `/admin`, `/admin/growth`,
`/admin/templates`, domain admin, billing/payout ops. Do not seed dev passwords.

## 15. Production seed plan

**Migrations already seed the platform (reproducible, safe for prod):**
`platform_config` (0031), Revenue Plans + shares + default-plan trigger (0053),
Community Health metrics + bands (0056), 5 starter templates (0067). Supported
engine versions are **code** (`SUPPORTED_ENGINE_VERSIONS`), not seeded.

**Must NOT reach production:** `supabase/seed.sql` (marbles reference tenant + demo
achievements) and `scripts/seed-demo.mjs` (demo users/creator/predictions +
super-admin with a dev password). No demo predictions, users, competitors, payouts,
or test tenants.

**One gap:** `platform_config.platform_name = 'Poll Pools'` is set in `seed.sql`
(dev-only). Production won't have it from migrations. Set it explicitly post-migrate
(a one-line `update platform_config set platform_name='Poll Pools'`, or via a Super
Admin config action). Everything else needed at launch is migration-seeded.

## 16. First real tenant (Marble Grand Prix) — plan (do NOT create now)

Create via the **Template Library** → **Racing** template, **without demo data**
(the brief's guidance). Then configure: display name, slug (`marbles` or dedicated),
branding + light/dark logo + colors, vocabulary (Marble/Race), features, media
behavior, revenue features, custom domain (`marblegrandprix.com`), real creator/
owner, real competitors + season/event data. Do not special-case the tenant — all
of this is standard tenant config + the domain admin flow.

## 17. pollpools.com platform domain

`pollpools.com` = platform surface: the apex landing (`src/app/page.tsx`, a public
tenant directory), sign-in, `/admin/**` (super-admin), templates/growth admin.
**Do not route `pollpools.com` into Marble** — it must remain the platform. Missing
today: dedicated Terms/Privacy/support routes (see §22). The apex currently lists
all active tenants publicly — confirm that directory is desired at launch (or gate
it).

## 18. Backups + recovery

**Supabase managed backups are plan-dependent and cannot be verified from source** —
confirm the production plan's backup cadence/PITR in the dashboard. Migrations are
**forward-only**; several are **irreversible** (enum `ADD VALUE`, dropped
columns/functions in earlier phases). There is **no automatic rollback**. Strategy:
**backup-before-migrate** (snapshot/PITR checkpoint), then **forward-fix** (a new
migration) rather than down-migrations. Failure behaviors: migration fails →
transaction rolls back that file, fix forward; deploy fails → Vercel keeps the prior
deployment (instant rollback); webhook processing fails → idempotent + retryable, no
double-grant; worker fails → jobs persist, drain on next cron; domain verification
fails → tenant simply not served on that host; Resend fails → auth emails don't send
(reset blocked) — treat as SEV.

## 19. Deployment rollback plan

- **App:** Vercel → promote the previous good deployment (instant).
- **DB:** no down-migrations — restore from backup/PITR or fix forward. Take a
  checkpoint before any migrate.
- **Monetization kill switch:** set `BILLING_PROVIDER=manual` (or disable the LS
  webhook) to stop grants immediately.
- **Cron kill switch:** remove/disable crons in `vercel.json` (redeploy) or rotate
  `CRON_SECRET` (endpoints 401).
- **Tenant domain kill switch:** set the `tenant_domains` row `verified=false` (or
  delete it) — the host stops resolving to the tenant immediately.
- **Irreversible changes:** enum additions, dropped columns — require
  backup-before-apply.

## 20. Security launch review

**Strong (verified in code):** RLS on all tenant tables (81 policies); service-role
only in trusted server paths behind explicit checks; `/admin/**` gated by
`requireSuperAdmin` (404 for others); tenant isolation (validated across suites);
DNS-TXT domain ownership verification; **HMAC-SHA256 + constant-time** webhook
verification; **idempotent** billing (`provider_event_id`, `idempotency_records`);
constant-time `CRON_SECRET`; auth never trusts arbitrary return URLs; **mock billing
routes hard-404 in production** (`NODE_ENV` guard, independent of provider); paid
Draft production gate intact. No `TODO security`, `FIXME`, or hard-coded credentials.
`localhost`/`127.0.0.1` appear only in dev routing/`baseUrlForHost` (not leaks).

**Gaps / to confirm:**
- 🟡 **No application-level rate limiting** (no limiter library). Rely on Vercel +
  Supabase platform limits; consider limiting auth + checkout endpoints.
- 🟡 `BILLING_WEBHOOK_SECRET` has an insecure **dev default** — must be overridden.
- 🟡 Confirm no Preview deployment inherits production service-role / live billing.
- ✅ Mock/webhook test routes are guarded; no dev-only bypass found.

## 21. Logging & monitoring

**Exists:** structured JSON logs from the drain/monitor endpoints; DB-level
`projection_health` (healthy/delayed/degraded/blocked/critical), `reconciliation_runs`,
dead-letter accounting, `audit_logs`. **Rely on Vercel** (function logs/errors) +
**Supabase** (DB logs, auth logs) dashboards — no third-party observability needed
at launch. **Add lightweight alerting** for: cron non-200s, `projection_health` !=
healthy, billing webhook failures, and (once wired) email failures. No app change
strictly required to launch.

## 22. Legal / policy surfaces (not legal advice)

Tenant settings support `legal_links` / `footer_links` (per-tenant). **Missing
platform routes:** Terms, Privacy, support/contact on `pollpools.com`. Revenue-share
transparency is correctly tenant-facing and **excludes Platform Support** (verified).
Before monetizing, add Terms/Privacy/refund/support surfaces (platform + optionally
per-tenant via the existing links config).

## 23. Production smoke-test plan (post-deploy)

**Platform (`pollpools.com`):** loads; sign-in; Super Admin `/admin`; templates;
growth admin; billing/payout admin. **Marble (`marblegrandprix.com`):** root loads
the tenant; `www`→apex 308; branding/vocabulary; sign-up/in; creator event creation
(+ optional media); prediction; community sentiment; settlement; job drain;
statistics/streak/leaderboard; Draft; Community Health; Growth Dashboard; Success
Timeline; Creator Support (test-then-live); regrade; reconciliation (0 diffs); auth
email received; logout; mobile; dark mode; **no console errors**.

## 24. GO / NO-GO matrix

| Item | Status | Note |
| --- | :-: | --- |
| Application code / tests / build | 🟢 | 554 tests, build clean |
| Migrations reproducible on empty DB | 🟢 | 0001–0067 verified |
| RLS / tenant isolation | 🟢 | 81 policies, tested |
| Webhook signatures / billing idempotency | 🟢 | HMAC + constant-time + idempotent |
| Mock-billing prod guard / paid-Draft gate | 🟢 | Hard 404 / gate false |
| Cron auth (CRON_SECRET) | 🟢 (app) / 🟡 (set secret) | 503 until set |
| **Custom-domain root serving** | 🔴 | **Rewrite not built** — Marble domain can't serve tenant |
| **Production email (auth SMTP)** | 🔴 | No Resend/SMTP configured; built-in mailer only |
| Supabase auth multi-domain allowlist | 🔴 | Local URLs only; add prod origins |
| Production Supabase project | 🔴 | Not created |
| Production Vercel project + env | 🔴 | Not configured |
| DNS / SSL (all 4 hostnames) | 🔴 | Not provisioned |
| Lemon Squeezy Live mode | 🟡 | Keys/products/webhook to create |
| Billing return-to-tenant-domain | 🟡 | Returns to platform URL |
| Super Admin (prod) | 🟡 | Manual creation + MFA |
| `platform_name` in prod | 🟡 | Only in dev seed |
| Rate limiting | 🟡 | None (platform limits only) |
| Backups / rollback | 🟡 | Managed (verify plan); forward-fix strategy |
| Monitoring / alerting | 🟡 | Data exists; add alerts |
| Terms / Privacy / support | 🟡 | Routes missing |

## 25. Blocking items (RED) — must clear before launch

1. **Build the custom-domain root rewrite** (`/*` → `/t/{slug}/*` from the resolved
   host header) so `marblegrandprix.com` serves the Marble tenant. *(app change)*
2. **Configure production email** — Resend verified sending domain + Supabase custom
   SMTP for auth emails (and, if desired, wire the app email transport). *(infra +
   small app wiring)*
3. **Set Supabase Auth Site URL + redirect allowlist** for `pollpools.com`,
   `marblegrandprix.com`, `www`, future tenant domains. *(infra)*
4. **Provision production Supabase, Vercel, DNS, SSL** for all four hostnames.
   *(infra)*
5. **Lemon Squeezy Live** key/products/variant IDs + production webhook;
   `TEST_MODE=false`, `BILLING_PROVIDER=lemon_squeezy`. *(infra)*

## Recommended launch order

1. Create **production Supabase**; run migrations (0001–0067); set `platform_name`.
2. **App changes** (separate PR, tested): custom-domain rewrite; billing
   return-to-primary-domain; add `EMAIL_*` to `env.ts`/`.env.example`; (optional)
   Resend adapter behind the existing interface.
3. Create **production Vercel** project; set all env (secrets → Sensitive); confirm
   Preview uses test billing + non-prod Supabase.
4. **Resend**: verify sending domain; add DNS records (from Resend); set Supabase
   custom SMTP.
5. **Lemon Squeezy Live**: create products/variants; set live env; register prod
   webhook; keep paid Draft OFF.
6. **DNS/SSL**: attach all four hostnames in Vercel; set DNS from Vercel's values;
   configure `www`→apex; wait for SSL.
7. **Supabase Auth**: set Site URL + redirect allowlist.
8. Create the **production Super Admin** (+ MFA); first-login admin smoke test.
9. Create **Marble Grand Prix** from the Racing template (no demo data); configure
   branding/vocabulary/creator/data; verify `marblegrandprix.com` in the domain
   admin; confirm serving + `www` redirect.
10. Run the **full smoke-test plan** (§23) on both domains; add monitoring alerts.
11. Only then: enable live billing on Marble and publish.

---

*Read-only audit — no production changes were made. Next step: a separate,
reviewed Production Launch Runbook.*
