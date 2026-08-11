# Security Launch Review

Pre-launch application security posture. Complements `docs/security-checklist.md`
and the runbook §22 final check.

## Authorization (verified)
- **Super Admin**: `/admin` layout `requireSuperAdmin()` (404s otherwise) AND every
  `admin.ts` loader self-gates (PL.7); every ops server action `assertSuperAdmin()`.
- **Tenant operator**: `creator/*` pages gated by `getMyCreator` ownership, IDOR-safe
  (`.eq(creator_id, own)`); lifecycle RPCs enforce `app.can_manage_event`; settlement
  `app.can_settle_event`. All SECURITY DEFINER, enforced server + DB side.
- **RLS** on all tenant tables; cross-tenant access tested (`rls-isolation`,
  `role-access`, `event-lifecycle` cross-tenant, `competitor-visual` isolation).
- **Platform Support privacy**: never on tenant surfaces (UI filter + creator/user-
  scoped loaders + DB RLS + formula); locked by `platform-support-privacy.test.ts`.

## Boundaries (verified)
- **Webhooks**: HMAC signature + constant-time comparison; `webhook_processing_status`
  dedup (idempotent, no duplicate effect).
- **Mock billing**: hard-disabled in production (`mockBillingUnavailable` =
  `NODE_ENV==='production'`), independent of `BILLING_PROVIDER`.
- **Paid Draft**: off unless `PAID_DRAFT_CHECKOUT_ENABLED` + a `provider_product_approvals`
  row.
- **Cron**: `authorizeCron` requires `CRON_SECRET` (constant-time; 503 unconfigured,
  401 wrong). Internal job endpoints are never open.
- **Open redirects**: `safeReturnPath` sanitizes all auth/billing return targets to a
  same-origin path (external/protocol-relative/backslash → `/`); billing return URLs
  are server-derived from the verified primary domain, never client input.
- **Custom domains**: only verified `tenant_domains` rows resolve to a tenant; unknown/
  unverified/inactive hosts fail safe (no tenant served).
- **Secrets**: server secrets never in `NEXT_PUBLIC_*` (`productionEnvIssues` guard).
- **Security headers** (`next.config.ts`): CSP (no `unsafe-eval` in prod; `frame-src`
  allows only YouTube — the sole inline-embedded provider), HSTS, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **No demo identities in prod**: `production-safety.test.ts` proves no migration/build
  path carries `@pollpools.test` / `@marblegp.test` / a known password.

## Rate-limiting review
No application-level distributed rate limiter is built (deliberately — spec §36/§27).
Classification of externally reachable mutation surfaces:

| Surface | Existing guard | Classification |
|---|---|---|
| Auth (sign-in/up/reset) | Supabase Auth built-in throttling | SAFE_WITH_EXISTING_GUARDS |
| Self-service tenant creation | per-user cap (10) + authenticated + verified-email-to-publish | SAFE_WITH_EXISTING_GUARDS |
| Predictions | membership + idempotency key + market lock gate | SAFE_WITH_EXISTING_GUARDS |
| Comments / social | auth + per-user scoping | SAFE_WITH_EXISTING_GUARDS |
| Creator Support checkout | auth + product↔tenant match + provider | SAFE_WITH_EXISTING_GUARDS |
| Webhooks | HMAC + dedup | SAFE_WITH_EXISTING_GUARDS |
| Custom-domain verification | super-admin only | SAFE_WITH_EXISTING_GUARDS |

**Decision:** no launch-critical trivial abuse path requires a new limiter now.
**Recommended fast-follow (not blocking):** enable Vercel/edge (WAF) rate limiting on
`/api/*` and auth routes once live traffic patterns are known. Documented, not deferred silently.

## Final live checks (runbook step 50)
Re-verify in production: RLS active; `/admin` 404 for non-admins; a mock-billing route
returns 404; `/api/internal/*` requires `CRON_SECRET`; no `@*.test` users; MFA on the
Super Admin; no debug/dev route reachable.
