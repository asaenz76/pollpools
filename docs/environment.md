# Environment Variables

Authoritative schema: `src/lib/env.ts` (`publicEnv`, `serverEnv()`, `ENV_CLASSIFICATION`,
`productionEnvIssues()`). `publicEnv` holds ONLY `NEXT_PUBLIC_*` values safe for the
browser bundle; `serverEnv()` is lazy so importing a module never forces secrets to
exist at build time. A server secret must never be exposed through a `NEXT_PUBLIC_*`
variable — `productionEnvIssues()` fails loudly if one is.

## Classification

| Variable | Class | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | REQUIRED_PRODUCTION | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | REQUIRED_PRODUCTION | public (RLS-protected) |
| `NEXT_PUBLIC_APP_URL` | REQUIRED_PRODUCTION | `https://pollpools.com` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | REQUIRED_PRODUCTION | `pollpools.com` — apex+www = platform |
| `SUPABASE_SERVICE_ROLE_KEY` | REQUIRED_PRODUCTION | **secret**, server only |
| `APP_SIGNING_SECRET` | REQUIRED_PRODUCTION | **secret** |
| `CRON_SECRET` | REQUIRED_PRODUCTION | **secret**; internal cron endpoints 401/503 without it |
| `BILLING_PROVIDER` | REQUIRED_PRODUCTION | `manual` until live; **never `mock` in prod** |
| `BILLING_WEBHOOK_SECRET` | OPTIONAL_PRODUCTION | **secret** |
| `LEMON_SQUEEZY_API_KEY` / `_STORE_ID` / `_WEBHOOK_SECRET` | OPTIONAL_PRODUCTION | **secret**; required when live |
| `LEMON_SQUEEZY_TEST_MODE` | OPTIONAL_PRODUCTION | `false` for live |
| `LEMON_SQUEEZY_*_VARIANT_ID` | OPTIONAL_PRODUCTION | live IDs only in prod |
| `PAID_DRAFT_CHECKOUT_ENABLED` | OPTIONAL_PRODUCTION | stays `false` unless approved |
| `RESEND_API_KEY` | OPTIONAL_PRODUCTION | **secret**; preferred email transport |
| `EMAIL_FROM` | OPTIONAL_PRODUCTION | sender identity |
| `EMAIL_API_ENDPOINT` / `EMAIL_API_KEY` | OPTIONAL_PRODUCTION | generic email transport fallback |
| `ALLOW_INTEGRATION_TEST_SKIP` | TEST_ONLY | never set in prod |

## Fail-loud rules (`productionEnvIssues`)

**Errors** (dangerous): missing any required server/public var; `CRON_SECRET`
missing in production; `BILLING_PROVIDER=mock` in production; live Lemon Squeezy
without `LEMON_SQUEEZY_WEBHOOK_SECRET`/`API_KEY`/`STORE_ID`; a server secret exposed
via `NEXT_PUBLIC_*`. **Warnings** (advisory): Lemon Squeezy in test mode in prod;
email transport unconfigured (notification emails safely skip).

Optional providers (email, custom domains, external media, paid draft) never become
errors merely because support exists — they stay optional per tenant.
