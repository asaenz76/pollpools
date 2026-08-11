# Custom domains & white label

Every tenant is reachable at its platform subdomain and may add custom domains.
Host → tenant resolution is entirely data-driven: no hostname-specific logic lives
anywhere in the app.

## Host resolution

`src/proxy.ts` (Next.js middleware) → `resolveTenantRef({ host, pathname, rootDomain })`
(`src/lib/tenant/resolver.ts`) produces one of:

1. **Path** — `/t/{slug}` (dev/platform), wins first so bare localhost works.
2. **Subdomain** — `{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}`.
3. **Custom domain** — any other host → looked up in `tenant_domains`.

The resolved tenant is stamped into request headers (never client-assertable) and
read by `getTenantContext`. A custom domain resolves **only** when its
`tenant_domains` row is verified.

## The `tenant_domains` model (migration 0050)

| Column | Meaning |
| --- | --- |
| `domain` | the hostname (unique) |
| `domain_type` | `platform` / `custom_subdomain` / `custom_apex` |
| `verification_status` | `pending` / `verified` / `failed` / `disabled` |
| `verification_token` | per-domain DNS-TXT token |
| `ssl_status` | `pending` / `provisioning` / `active` / `failed` / `disabled` |
| `is_primary` | exactly one primary per tenant (unique index) |
| `verified` | legacy boolean read by RLS + resolution, kept in lockstep with `verification_status` by a trigger |

## Verification (ownership is never trusted)

Adding a domain stores a `pending` row + a token. The tenant creates a DNS TXT
record:

```
_pe-verify.<hostname>   TXT   "pe-verify=<token>"
```

The verify action (`src/lib/ops/domain-actions.ts` → `src/lib/domain/dns-verify.ts`)
does a **real** TXT lookup and flips the row to `verified` on a match. The record
prefix is a neutral fixed token — **not** the platform brand.

## Primary domain & redirects

Exactly one verified domain is primary (DB unique index). A request on a verified
**non-primary** custom domain is 308-redirected to the primary by the middleware
(`computeDomainRedirect`), so a tenant has one canonical origin.

## Auth binding

Auth emails (sign-up confirmation, password reset) return to the tenant's **primary
domain** via `resolveTenantHomeUrl`, falling back to the platform URL when there is
no verified primary. Return targets are built server-side from the tenant slug;
arbitrary client-supplied return URLs are never trusted (`safeReturnPath` keeps
same-origin paths only).

## White label

- **Platform brand name** is configuration — `platform_config.platform_name`
  (neutral default), surfaced via `TenantContext.platformName`. Never hardcoded.
- **`tenant_settings.show_powered_by`** toggles the "Powered by &lt;platform&gt;"
  footer; a fully white-labelled tenant hides it.
- **Logo / favicon / theme** already live on `tenants` (`logo_url`, `icon_url`,
  `theme`) and are injected at first paint (no flash).

## SSL / DNS provisioning — infra boundary

Actual DNS record creation and automatic TLS certificate provisioning are
hosting-platform concerns (e.g. Vercel Domains). The app records `ssl_status` and
exposes the verification + primary/redirect logic; wiring a real provisioning API
is a deployment integration, intentionally out of scope for the app layer.

## Root routing on tenant hosts (PL.1)

The app's routes live under `/t/[tenantSlug]/…`. On a **verified custom domain** or a
**tenant subdomain**, the middleware serves the tenant from that route tree while the
browser URL stays clean:

- Host classification is centralized in `src/lib/tenant/host.ts` (`classifyHost` →
  `platform | subdomain | custom | unknown`; pure `tenantRewriteTarget` /
  `stripTenantPrefix`), authoritative via `tenant_domains`.
- `src/lib/supabase/middleware.ts`: on a verified custom domain (or subdomain), it
  **rewrites** `/path` → `/t/{slug}/path` internally (URL unchanged), and **308-strips**
  the tenant's own `/t/{slug}` prefix so nested links stay prefix-free. `/api`, `/_next`,
  `/admin`, `/terms`, `/privacy`, `/support`, and static files are never rewritten.
- Non-primary verified domains (e.g. `www`) 308-redirect to the primary host,
  preserving path + query (`computeDomainRedirect`).
- Unknown / unverified / inactive hosts fail safe — no tenant is served.

**Local verification (host-header simulation):**

```bash
# custom-domain root serves the tenant (seed a verified tenant_domains row first)
curl -s -H "Host: marblegrandprix.com" http://localhost:3000/            # → Marble tenant home
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: marblegrandprix.com" http://localhost:3000/leaderboard   # → 200
# tenant's own /t/{slug} prefix strips to a clean path
curl -s -o /dev/null -w "%{redirect_url}\n" -H "Host: marblegrandprix.com" http://localhost:3000/t/marbles/leaderboard  # → /leaderboard
# non-primary → primary, path+query preserved
curl -s -o /dev/null -w "%{redirect_url}\n" -H "Host: www.marblegrandprix.com" "http://localhost:3000/events?x=1"       # → https://marblegrandprix.com/events?x=1
# platform apex unaffected; /t/{slug} path still valid (backwards compatible)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/t/marbles  # → 200
```

Production custom-domain serving still requires the hosting-platform steps (attach
domain to Vercel, DNS, SSL) and the verified `tenant_domains` row — see the
[Production Launch Runbook](production-launch-runbook.md) steps 29–34. Do not mark
production custom-domain serving complete merely because the app supports it.
