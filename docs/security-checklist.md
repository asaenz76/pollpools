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
- ⏳ One-prediction-per-market unique constraint + idempotency keys (Phase 2).
- ⏳ Idempotent settlement `(event_id, grading_version)` + row locks (Phase 4).
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
