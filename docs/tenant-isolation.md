# Tenant Isolation

Isolation is enforced in **two independent layers**. Either alone would be a
single point of failure; together they make cross-tenant access structurally
impossible.

## Layer 1 — Server-side tenant resolution

The tenant is derived from the **trusted request** (host / path), never from
client input:

1. `src/proxy.ts` runs on every navigation and calls `resolveTenantRef` with the
   request `host` + `pathname` + configured root domain.
2. The result is stamped into forwarded request headers
   (`x-pe-tenant-kind`, `x-pe-tenant-value`, `x-pe-tenant-source`). Any
   client-supplied copies of these headers are **stripped first** to prevent
   spoofing.
3. `getTenantContext()` (server, memoized per request) reads those headers and
   loads the tenant + settings + feature flags from the DB, verifying the tenant
   is `active` (or the custom domain is `verified`).

The client cannot assert a tenant id. There is no code path where a request body
or query parameter selects the tenant.

## Layer 2 — Row Level Security (backstop)

Every tenant-owned table has RLS **enabled** with **deny-by-default** (no policy
⇒ no access). Policies grant only what a role may see/do:

- **Reads**: public/published data (active tenants, verified creators, public
  profiles) is readable; private data (memberships, roles, audit, moderation,
  idempotency) is restricted to the owner / tenant admin / super admin.
- **Writes**: constrained to the owning user, with privilege-escalation gates
  (e.g. a user may self-join a tenant only as `role='member'`; only a super
  admin may write `user_roles`).

### Helper functions

`SECURITY DEFINER` functions in the `app` schema back the policies:

| Function | Meaning |
| --- | --- |
| `app.is_super_admin()` | global `super_admin` grant for `auth.uid()` |
| `app.is_tenant_member(t)` | active membership in tenant `t` |
| `app.is_tenant_admin(t)` | active `admin` membership in tenant `t` |
| `app.owns_creator(c)` | caller owns creator `c` |

They are `SECURITY DEFINER` (owned by `postgres`) so they bypass RLS on the
lookup tables and cannot recurse through the policies that call them.

### Roles & grants

- `anon` → `SELECT` only, still RLS-gated (public pages).
- `authenticated` → DML, every row RLS-gated.
- `service_role` → full access, **bypasses RLS**; used only by trusted server
  code (settlement, webhooks, admin jobs) behind explicit authorization checks.

## What the tests prove

`tests/integration/rls-isolation.test.ts` verifies, against a live database:

- A member of tenant A sees only their own membership, not tenant B's.
- Private profiles in another tenant are invisible.
- A user cannot self-grant `super_admin` (escalation blocked, and it does not
  land in the table).
- A user cannot modify another tenant's settings.
- A creator owner cannot self-verify or self-grant `settlement_enabled`, but can
  edit non-privileged fields.
- The idempotency ledger is unreadable to normal users (service-role only).
