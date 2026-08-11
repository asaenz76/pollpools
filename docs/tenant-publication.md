# Tenant Publication Lifecycle

Self-service community creation is open (any signed-in user), so newly created
communities are an anti-junk concern. A self-created tenant is **fully operable from
the start** but **absent from platform discovery** until the owner deliberately
publishes it once objective criteria are met (PL.4).

## Model
Listing is a separate dimension from status — `tenants.listed` (boolean, default
`true`), **never** the `tenant_status` enum. An unlisted tenant is `status='active'`
(works normally by direct URL) but `listed=false` (not shown in discovery).
**Unlisted ≠ suspended.** Legacy + admin-created tenants keep `listed=true` (default),
so nothing already live changes.

- `create_pollpool` (self-service) sets `listed=false`.
- The platform directory (`app/page.tsx`) filters `status='active' AND listed=true`.
- `getTenantContext` requires only `status='active'` — unlisted tenants resolve and
  work by direct URL / custom domain.

## Eligibility (objective, minimal — spec §24)
`public.pollpool_publish_eligibility(tenant)` (owner or super-admin) checks:
1. **Owner email verified** (`auth.users.email_confirmed_at`),
2. valid **name**, 3. valid **description**, 4. at least one **published** (non-draft) event.

Community Health, Revenue Plan, WAU, and custom domains **deliberately do not** gate
publication. No admin approval.

## Publish
`public.publish_pollpool(tenant)` re-checks eligibility and sets `listed=true`
(audited `tenant.published`). The dashboard shows a "Publish your PollPool" checklist
while unlisted, with the button enabled once eligible. V1 uses the deliberate
owner-click model (option B) — the owner decides when they're ready to appear in
discovery.

## Guardrails (V1, no large anti-abuse system)
Authenticated user only · verified email required for public listing · per-user
tenant creation cap (10, in `create_pollpool`) · unlisted default · objective
publication criteria · existing moderation/admin capabilities. Future: trust
scoring, CAPTCHA, review queues — deliberately deferred.

Tests: `tests/integration/tenant-publication.test.ts`.
