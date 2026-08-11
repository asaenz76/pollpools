# Role Experience Architecture

Three intentional product experiences on **one** application — never three apps.
They differ through information architecture, default routing, navigation, and
visibility, not through forked business logic. Settlement, grading, billing, growth,
Community Health, Draft, leaderboards, tenant context, providers, and auth stay
shared. See the baseline inventory in [role-experience-audit.md](role-experience-audit.md).

## The three roles

| Role | Verb | Default landing | Primary surface |
|---|---|---|---|
| **Member** | Participate | tenant home `/t/{slug}` | prediction/participation pages + member `BottomNav` |
| **Tenant operator** | Operate + grow | Tenant Dashboard `/t/{slug}/creator` | dashboard + management IA |
| **Super admin** | Govern + monitor | Platform Admin `/admin` | Phase 8-A ops console (reused) |

## Central resolution (authorization vs presentation)

`src/lib/auth/roles.ts` is the single place role→experience decisions live:

- `platformRoleOf(viewer)` maps a resolved `TenantViewer` to
  `super_admin | tenant_operator | member | guest`. Super-admin wins; operator =
  owns a creator here **or** holds an admin/creator membership; else member.
- `canOperateTenant(viewer)` gates management affordances.
- `defaultPathForRole(role, slug)` / `resolveDefaultDestination(...)` decide where a
  fresh login lands.

**This is presentation only.** Authorization is unchanged and still enforced
server- and DB-side: `/admin` by `requireSuperAdmin()` (now in the layout **and**
every loader), `creator/*` by `getMyCreator` ownership (IDOR-safe), every server
action by its own `assertSuperAdmin`/ownership/RLS/SECURITY-DEFINER check. Role
checks are **not** scattered through components — components ask the resolver.

## Multi-role & context switching

A user is not one fixed role. A tenant operator is a *member* while viewing a public
community and an *operator* inside Manage. The single deliberate switch is the
header **RoleContextBar** (`Manage` for operators, `Platform Admin` for super
admins) plus the dashboard's **View community** link. Super-admin privileges never
silently turn a public page into an admin page — entering a tenant or `/admin` is an
explicit action.

## Role-aware post-login routing

`signInAction` (RX.2) resolves the destination in this order:

1. A **safe return path** — the page the user was heading to before sign-in, passed
   as `?next=` and sanitized by `safeReturnPath` (same-origin path only; anything
   else falls through). Legitimate intent always wins over the role default.
2. Otherwise the **role default** (`resolveDefaultDestination`): super admin →
   `/admin`, operator → `/t/{slug}/creator`, member → `/t/{slug}`.

Custom domains are unchanged: tenant identity flows through middleware-stamped
headers with a 308-to-primary redirect; auth emails return to the tenant's primary
domain via `resolveTenantHomeUrl`. Production root-domain serving remains launch
infrastructure (see the readiness audit) — role routing does not depend on it and
does not claim it complete.

## Member experience

Participation-first. The member sees open/upcoming predictions, competitions, Draft,
history, streaks, ranks, achievements, feed, notifications, profile — and **no**
operational concepts (reconciliation, jobs, revenue config, domains, plan config,
moderation). Nav is the five-item `BottomNav` (Home/Feed/Ranks/Alerts/You). The
signed-in home card shows "Manage community" **only** to operators; members instead
get "Create your PollPool".

## Tenant experience

The Tenant Dashboard (`/t/{slug}/creator`) answers "what needs my attention / what's
happening / what next":

- **Needs attention** — from live data: locked events needing a result, events
  locking within 24h, Revenue Plan at-risk, domain verification pending.
- **Quick actions**, **Upcoming & recent** (reusing the event-lifecycle controls),
  **Growth / Community Health / Revenue** summary cards (reusing `src/lib/growth/*`
  and `getCreatorRevenue` — never recomputed), **This period**, and a **setup
  checklist** whose completion is derived from real data (logo, first competition,
  first event, first published prediction, domain, Creator Support).
- **Management IA** (`TenantManageNav`): Overview · Content · Community ·
  Monetization · Settings — each backed by a real page.

**Revenue Plan and Community Health stay separate**: Health is coaching and never
gates the plan. **Platform Support is never present on any tenant surface** —
enforced by UI filters, creator/user-scoped loaders, and DB RLS + formula, locked by
`platform-support-privacy.test.ts`.

## Super admin experience

Default lands on the reused `/admin` (Phase 8-A) — platform overview, tenants,
growth, templates, per-tenant ops/domains/moderation/payouts. Not rebuilt. Tenant
inspection is deliberate (View community / open tenant ops). Platform Admin nav is
never mixed into member nav.

## Onboarding — Create Your PollPool

Self-service community creation (RX.4). A signed-in user creates a brand-new tenant
from a **published template** and becomes its operator. Reuses the atomic
`create_pollpool` RPC (extracted `app.provision_tenant_from_template`, shared with
the admin path — never duplicated). Four steps: Community (name/URL/description/
template) → Basics (timezone/language) → Experience (Creator Support toggle; media
optional; Draft is per-competition) → Review → Create → the new dashboard + setup
checklist.

- **Media is always optional** — events never require video; YouTube is one optional
  provider, not a requirement.
- **Revenue Plan auto-assigns** — tenants never choose it.
- **Atomic** — a provisioning failure leaves no partial tenant.
- **Guardrails**: authenticated only, template slug/name validation, a per-user cap;
  the new creator is **pending verification** (never auto-verified, never
  super-admin). Existing tenants are untouched and never forced through onboarding.

Residual: self-service creation widens who can create tenants (additive, guardrailed)
— worth a listing/anti-abuse pass before scale.

## Tests

`tests/unit/roles.test.ts` (resolver), `tests/integration/self-service-pollpool.test.ts`
(onboarding matrix), `tests/integration/role-access.test.ts` (DB authz boundaries),
plus the unchanged suites for events, billing, growth, templates, providers, domains.
