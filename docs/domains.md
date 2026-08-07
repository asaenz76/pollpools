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
