# Decisions & Assumptions

This log records non-obvious architectural decisions and the assumptions made
during implementation. Update it as decisions change.

## Assumptions (V1)

1. **Package manager: npm.** No pnpm in the environment.
2. **Local Supabase for development** via the CLI + Docker. A hosted project can
   be linked for deploy (`supabase link`); the MVP runs fully local.
3. **Non-default local ports (5433x)** so this project coexists with other local
   Supabase stacks on the same machine. See `supabase/config.toml`.
4. **Billing is provider-mocked in V1** (`BILLING_PROVIDER=mock`). The single
   unified billing/webhook pipeline proves HMAC signature verification and
   idempotent, replay-safe handling without wiring a live processor. Swappable via
   env (`lemon_squeezy` | `mock` | `manual`). The legacy `SUBSCRIPTION_PROVIDER` /
   `SUBSCRIPTION_WEBHOOK_SECRET` env were removed when the payment stacks were
   unified (F-01).
5. **Dev tenant routing uses `/t/{slug}`** (subdomains need wildcard DNS not
   available on localhost). Host/subdomain + custom-domain resolution still runs
   in the proxy for production.
6. **Email/password auth** via Supabase Auth (magic-link ready, password default).
7. **`public.users` mirrors `auth.users`** via an `after insert` trigger, so app
   tables FK to a public row (RLS-friendly) rather than the `auth` schema.
8. **Super Admin is a global grant** in `user_roles` (`role='super_admin'`,
   `tenant_id is null`), resolved server-side only.
9. **Membership + profile are auto-created** on a signed-in user's first tenant
   visit (`ensureMembership`), exercising the RLS self-insert policies.

## Key decisions

### ADR-001 — RLS isolation model
A user can only touch tenants they belong to (via `tenant_memberships`) or that
are publicly readable (active + published). The application additionally narrows
every query to the single request-resolved tenant. RLS is the **backstop**, not
the only gate. Helper functions (`app.is_super_admin`, `app.is_tenant_member`,
`app.is_tenant_admin`, `app.owns_creator`) are `SECURITY DEFINER` so they bypass
RLS on lookup tables and cannot recurse through the policies that call them.

### ADR-002 — Generic core, vertical in metadata
Shared tables use generic names (`competition`, `event`, `competitor`, `market`,
`option`, `prediction`, `result`, `settlement`). No shared column names a sport
(`home_team`, `marble`, …). Vertical specifics live in competitor rows, option
labels, and JSONB `metadata`. Enums are the single vocabulary
(`src/types/enums.ts` ⇔ SQL enums, kept in lockstep).

### ADR-003 — Creator settlement permission (grantable)
By default only a Super Admin can settle / ungrade / regrade. A Super Admin may
grant a specific creator `creators.settlement_enabled = true`, allowing that
creator to settle/regrade **their own events** — still audited, step-up
confirmed, and idempotent, and still unable to delete immutable settlement rows.
A DB trigger (`app.protect_creator_privileged_columns`) prevents creators from
self-verifying or self-granting this permission; only a super admin or the
service role may change `verification_status` / `settlement_enabled`.

### ADR-004 — Three Supabase clients
`server` (RLS, session cookies) for normal reads/writes; `client` (browser, anon)
for client components; `admin` (service role, bypasses RLS) for trusted server
code only. `admin` and `server` import `server-only` so a client bundle that
references them fails to build. The service-role key is never `NEXT_PUBLIC_`.

### ADR-005 — Security headers / CSP
Strict CSP in production (no `unsafe-eval`, `frame-ancestors 'none'`, YouTube
only via `youtube-nocookie.com`). Development relaxes `unsafe-eval` (React dev
build) and `ws:` (HMR) and drops `upgrade-insecure-requests`. HSTS, nosniff,
`X-Frame-Options: DENY`, and a locked-down `Permissions-Policy` are always on.

### ADR-006 — Competitor Draft is additive & independent (Phase 4.5)
Draft participation is a separate system from Open Predictions and must never
affect prediction scoring. Rather than modify Phase 4's `settle_event`/`regrade_event`,
draft scoring hooks in via an **AFTER UPDATE trigger on `settlements`** that fires
when any settlement becomes active — so Phase 4 code is unchanged and all Phase 1–4
tests still pass. Draft standings are recomputed from active `event_competitor_results`
(same reversible-derived-cache pattern as prediction stats), so regrade corrects
them automatically. Exclusivity is enforced by partial unique indexes + advisory
locks, not app logic. Payments are provider-agnostic with a mock/test adapter only
(no provider hard-coded); fees/currency always come from server config. Draft has
its own leaderboard table, never mixed with prediction leaderboards. Copy avoids
ownership/betting language and keeps the "drafting is optional" notice visible.

### ADR-007 — Mobile-first, zero horizontal bleed
The app must fit perfectly at **320px** with **no page-level horizontal scroll**.
Layout conventions to prevent bleed:
- **Vertical stacks use `flex flex-col gap-*`, not `grid gap-*`.** A bare `grid`
  creates `auto` tracks that size to child content, so a wide child (long title,
  a nested stat grid) pushes the page wider. Flex columns constrain children to
  the container width.
- **Multi-column grids always declare an explicit base column** (`grid-cols-1`
  … `sm:grid-cols-2`) and use `min-w-0` where a grid/flex child must shrink.
- **Long text truncates** (`min-w-0 truncate`) inside flex rows; the sibling
  stays `shrink-0`.
- **Genuinely wide content** (the bracket) scrolls inside its own
  `overflow-x-auto` container — never the page body.
Verified programmatically at 320px (`document.scrollWidth === clientWidth`) across
all routes.

### ADR-008 — Provider-neutral billing; webhooks are the only grant path
Monetization is optional and provider-agnostic. A `BillingProvider` interface
(`src/lib/billing/`) is the sole boundary; provider SDK types never leak past it.
V1 ships **Lemon Squeezy**, **mock** (fully signed, drives the whole pipeline in
dev/test), and **manual** adapters — swapping is a config + one-file change.
Entitlements and earnings are created **only** by signature-verified webhooks via
one function (`apply_billing_event`); a redirect never grants anything. Webhooks
are idempotent on `(provider, provider_event_id)` (replay → 200 no-op; bad sig →
401), and a cross-tenant event is rejected (`CROSS_TENANT_EVENT`). Prices,
currencies, and variant ids are always resolved server-side from
`billing_products` — client values are ignored. Lemon Squeezy has no split
payments, so creator revenue is tracked internally in an **immutable
`creator_earnings` ledger**; refunds append negative compensating rows (never
mutate), and a balance is the sum of the active set (same reversible-derived
pattern as stats/draft standings). Payouts are **manual**: earnings are marked
paid only when a payout is marked paid; the payout functions are super-admin /
service-role only. Paid Competitor Draft stays gated behind
`PAID_DRAFT_CHECKOUT_ENABLED` **and** an approved `provider_product_approvals`
row. No wallet, stored value, or outcome-linked payout exists anywhere; payments
never touch scoring, settlement, draft standings, or sentiment. See
[`monetization.md`](monetization.md).

## Phase plan

1. **Foundation** — scaffold, tenancy schema, RLS, auth, tenant resolver, theme ✅
2. Core prediction engine — competitions, events, markets, predictions, sentiment
3. Competition formats — standalone, season, tournament, bracket
4. Settlement & scoring — idempotent settlement, stats, streaks, leaderboards, achievements ✅
4.5. Competitor Draft Engine — optional draft (free/paid), scoring, prizes, separate leaderboard ✅
5. Social — feed, profiles, following, notifications, sharing ✅
6. Creator product — onboarding, dashboard, creation flows, result submission ✅
7. Monetization — premium, creator support, sponsorships; provider-neutral billing ✅
8. Admin & ops — tenant mgmt, moderation, settlement controls, audit, health
   (includes the deferred admin billing screens: provider status, products,
   provider mappings, approvals, orders, subscriptions, refunds, failed webhooks,
   reconciliation, earnings, payout queue, paid-draft enablement)
9. Reference marble tenant — full end-to-end seed
10. QA & launch — a11y, responsive, security review, e2e, docs
