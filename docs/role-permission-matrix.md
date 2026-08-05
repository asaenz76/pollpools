# Role & Permission Matrix

Three global role concepts (V1): **Super Admin**, **Creator**, **User**. Tenant
standing is scoped via `tenant_memberships` (`member` / `creator` / `admin`);
Super Admin is a global grant in `user_roles`.

Enforced in two layers: **RLS policies** (DB) + **server-side role guards**
(route handlers / server actions).

| Capability | User | Creator | Super Admin |
| --- | :---: | :---: | :---: |
| Register / sign in / profile | ✅ | ✅ | ✅ |
| Follow creators, feed, share | ✅ | ✅ | ✅ |
| Submit 1 prediction / market (pre-lock) | ✅ | ✅ | ✅ |
| Edit prediction before lock (if enabled) | ✅ | ✅ | ✅ |
| Create competitions / events / markets | ❌ | ✅ (own) | ✅ |
| Add competitors / channels | ❌ | ✅ (own) | ✅ |
| Set lock times, publish, cancel events | ❌ | ✅ (own) | ✅ |
| Submit result | ❌ | ✅ (own event) | ✅ |
| **Settle / ungrade / regrade** | ❌ | ✅ **own, only if `settlement_enabled` granted** (step-up, audited) | ✅ (any, step-up, audited) |
| View private creator analytics | ❌ | ✅ (own only) | ✅ |
| Manage creator support settings | ❌ | ✅ (own) | ✅ |
| Approve / verify creators | ❌ | ❌ (never self) | ✅ |
| Manage tenants / branding / flags | ❌ | ❌ | ✅ |
| Moderate users & content | ❌ | ❌ | ✅ (+ tenant admins triage) |
| Subscription products / sponsorships | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ❌ | ✅ (+ tenant admin, own tenant) |
| Cross-tenant private data | ❌ | ❌ | ✅ (scoped, audited) |

## Hard rules (never overridable)

- A creator can **never** access another creator's private analytics or another
  tenant's data.
- A creator can **never** approve their own verification or self-grant
  `settlement_enabled` (DB trigger enforced).
- **Nobody** deletes immutable settlement rows; corrections use compensating
  grades + new grading versions.
- Modifying locked predictions is impossible for everyone.
- High-risk Super Admin actions (settlement override, tenant suspension) require
  **step-up confirmation** and are audited.
