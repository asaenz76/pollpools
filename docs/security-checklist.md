# Security Checklist

Status legend: ✅ implemented · ⏳ later phase.

## Access control & isolation
- ✅ RLS enabled on every tenant-owned table (deny-by-default).
- ✅ Tenant resolved server-side from host/path; client cannot assert tenant id.
- ✅ Client-supplied tenant headers stripped in the proxy before re-stamping.
- ✅ Server-side role checks (`getSessionUser`, `isSuperAdmin`, `getTenantViewer`).
- ✅ No self-granted `super_admin` (RLS: only super admin writes `user_roles`).
- ✅ No creator self-verify / self-grant settlement (DB trigger).
- ✅ Service-role key server-only (`server-only` import guard; never `NEXT_PUBLIC_`).
- ⏳ Step-up confirmation for settlement overrides (Phase 4/8).

## Input & transport
- ✅ Zod validation on auth inputs (extended per feature).
- ✅ Security headers: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` (`next.config.ts`).
- ✅ Strict production CSP (no `unsafe-eval`; `frame-ancestors 'none'`; YouTube
  only via `youtube-nocookie.com`). Dev relaxes eval/ws for HMR.
- ✅ `poweredByHeader` disabled.

## Integrity & idempotency
- ✅ `idempotency_records` ledger (service-role only), `(scope, key)` unique.
- ✅ `audit_logs` append-only + `app.write_audit` (SECURITY DEFINER).
- ✅ One-prediction-per-market unique constraint + idempotency keys + advisory
  lock; predictions written only via `submit_prediction` (no direct write policy).
- ✅ Server-time lock enforced in-DB (client clock never trusted).
- ✅ Idempotent, versioned settlement: `(event_id, grading_version)` unique, one
  active per event (partial unique index), row-lock, idempotency key; grades are
  immutable and stats recomputed from the active set (reversible regrade).
- ✅ Settlement authorization: super admin / service role / creator with the
  `settlement_enabled` grant only; `advance_bracket` service-role only.
- ✅ Draft exclusivity/one-per-user via partial unique indexes + advisory lock
  (concurrency-tested: exactly one wins); assignments created only via
  `draft_competitor` (no direct client insert).
- ✅ Draft fees/currency read only from server config; `confirm_draft_payment`
  service-role only, signature-verified, replay-safe (`(provider, reference)` unique).
- ✅ Draft availability exposed via aggregate (`draft_roster`) — no leak of who
  drafted whom; prize awards idempotent.
- ⏳ Subscription webhook signature verify + replay protection (Phase 7).

## Data protection
- ✅ Soft-deletable users so historical predictions are preserved.
- ⏳ Private Storage bucket for creator verification documents (Phase 6).
- ⏳ Signed upload URLs (Phase 6).
- ⏳ Rate limiting on sensitive endpoints (Phase 2+).

## Threats explicitly guarded
- Cross-tenant data exposure — RLS + server resolution (✅ tested).
- IDOR / broken access control — RLS row scoping (✅ tested).
- Privilege escalation — `user_roles` write gate + creator trigger (✅ tested).
- SQL injection — parameterized Supabase queries / RPC only.
- XSS — React escaping + CSP.
- Duplicate predictions / settlements / webhook replay — idempotency (⏳ per phase).

## How to run the security-relevant tests
```bash
npm run db:start
npm run test:integration      # RLS isolation & privilege gates
```
