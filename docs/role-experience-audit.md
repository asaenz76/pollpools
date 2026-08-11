# Role & Tenant Experience — Read-Only Audit (RX.1)

Baseline audit before the Role Experience Hardening phase. **No code was changed
to produce this.** Conclusion: the platform is functionally complete and correctly
secured, but the three roles (Member / Tenant / Super Admin) are **not
differentiated as product experiences** — they share the same member navigation and
default routing. There is **no** launch-blocking permission/security problem, so the
phase proceeds (spec §1).

## Route / capability matrix

Classification: **PUBLIC** (anon) · **MEMBER** (participation) · **TENANT** (operate)
· **SUPER_ADMIN** (govern) · **SHARED** (context-dependent).

| Route | Class | Notes |
|---|---|---|
| `/` (`app/page.tsx`) | PUBLIC | Platform landing + public tenant directory. Host-driven: apex→platform, custom domain→tenant. |
| `/t/[slug]` | SHARED | Tenant home. **Identical for owner vs member** — no management affordance. Shows a "Creator Studio" link to every signed-in user. |
| `/t/[slug]/e/[eventSlug]` | SHARED | Public event/prediction page; predict/social gated by `signedIn`. Read-only result display. |
| `/t/[slug]/c/[competitionSlug]` | SHARED | Competition/draft/bracket; draft gated by `signedIn`. |
| `/t/[slug]/leaderboard` | PUBLIC | Global leaderboard (read). |
| `/t/[slug]/feed` | PUBLIC | Activity feed (read, keyset paginated). |
| `/t/[slug]/creators`, `/creators/[creatorSlug]` | SHARED | Creator directory + profile; follow/support gated by feature + `signedIn`. |
| `/t/[slug]/notifications` | MEMBER | Auth-required; own notifications. |
| `/t/[slug]/me` → `/u/[handle]` | MEMBER | Auth-required redirect to own profile. |
| `/t/[slug]/u/[handle]` | SHARED | Profile; visibility gated by feature + `isPublic`. |
| `/t/[slug]/premium` | SHARED | Platform Premium purchase (feature-gated). |
| `/t/[slug]/billing` | MEMBER | Own subscriptions/orders; self-service consumer billing. |
| `/t/[slug]/creator` | TENANT | Creator Studio home (stats + lists). Gated by `getMyCreator` (owner check). |
| `/t/[slug]/creator/onboarding` | TENANT | "Become a creator" — creates a `creators` row **within the current tenant** (not a new community). |
| `/t/[slug]/creator/{profile,competitors,new/*,c/[id],e/[id]/*}` | TENANT | Create/manage competitions, competitors, events, results. IDOR-safe (`creator_id`-scoped). |
| `/t/[slug]/creator/analytics` | TENANT | Followers + per-event participation. |
| `/t/[slug]/creator/growth` | TENANT | Growth dashboard: plan, WAU, Community Health, Platform Status, Success Timeline. |
| `/t/[slug]/creator/revenue` | TENANT | Creator earnings + payout requests (Platform Support excluded). |
| `/admin` | SUPER_ADMIN | Platform overview (projection health). Layout-gated `requireSuperAdmin()`. |
| `/admin/tenants[/**]` | SUPER_ADMIN | Per-tenant ops, domains, moderation, payouts. |
| `/admin/growth[/plans,/health]` | SUPER_ADMIN | Revenue-plan + health config. |
| `/admin/templates[/**]` | SUPER_ADMIN | Template library + create-tenant-from-template. |
| `/api/internal/*`, `/api/webhooks/*`, `/api/billing/mock/*` | SUPER_ADMIN / system | Cron (CRON_SECRET), webhooks (signature), mock (guarded). |

## Capability → does a tenant have self-service UI?

| Capability | Tenant self-service UI? | Backend / where |
|---|---|---|
| Events / competitions / results lifecycle | **Yes** | `creator/*` + event-lifecycle RPCs |
| Competitors (add) | Partial (add only, no edit/delete) | `addCompetitorAction` |
| Growth / Community Health / Success Timeline (view) | **Yes** | `src/lib/growth/*`, `community_health_now`, `dashboard.ts` |
| Revenue / earnings / payout requests | **Yes** | `getCreatorRevenue`, `creator_earnings` |
| Branding / theme / logo | **No** | super-admin only (`tenant_settings.theme`, RLS super-admin) |
| Feature flags (draft / support / media) | **No** (no runtime write path at all) | `tenant_feature_flags`, seeded only |
| Custom domain | **No** (admin only) | `ops/domain-actions.ts` (`assertSuperAdmin`) |
| Community / tenant settings | **No** | `tenant_settings`, RLS super-admin |
| **New community (tenant) creation** | **No** (super-admin via templates only) | `create_tenant_from_template` (0066) |

## Key findings

1. **No role-aware routing.** `signInAction` always redirects to `/t/{slug}`; no
   super-admin→`/admin` or owner→dashboard routing, and no return-URL handling.
   `safeReturnPath` (`domains.ts`) exists but is **unused dead code**. → RX.2.
2. **One navigation for everyone.** The member `BottomNav` (Home/Feed/Ranks/Alerts/
   You) is shown to members, tenant owners, and super admins alike. Tenant operators
   have **no "Manage" entry** and no operating dashboard beyond the stats-tiles
   Creator Studio. → RX.2/RX.3/RX.5/RX.6.
3. **Weak tenant onboarding.** "Become a creator" only collects name + description
   and creates a creator inside the *current* tenant. There is **no self-service
   new-community creation** — only super admins provision tenants (from templates).
   → RX.4 (additive, reuses `create_tenant_from_template`).
4. **Tenant self-service settings gap.** Branding/logo, feature toggles, domains, and
   community settings are super-admin-only. Building a tenant Settings section
   requires *additive* owner-scoped write paths (never altering existing perms). →
   RX.5, handled conservatively; domain stays admin/infra-managed (spec §17, §34).
5. **Security: clean.** Every `/admin` route (layout `requireSuperAdmin()`), every
   `creator/*` page (`getMyCreator` owner check, IDOR-safe), and every server action
   (per-action `assertSuperAdmin`/ownership/RLS/SECURITY DEFINER) is enforced
   server- and DB-side — never by hidden navigation. No management surface relies on
   UI hiding. **LOW** (defense-in-depth): `/admin` overview + `/admin/tenants/**`
   loaders self-gate only via the layout; add `requireSuperAdmin()` inside the
   `admin.ts` loaders for consistency. → RX.7 (non-blocking).
6. **Platform Support privacy: leak-free.** Never present on tenant surfaces —
   enforced in three layers (UI filter, creator/user-scoped loaders, DB RLS +
   formula) and locked by `platform-support-privacy.test.ts`. Must stay that way.
7. **Custom-domain serving is header-based** (308-to-primary, no `/t/{slug}`
   rewrite) — production root-domain serving remains launch infra (spec §34); role
   routing must not regress it and must not claim it complete.

## Slice plan

RX.2 central role/context resolver + role-aware post-login routing (+ wire
`safeReturnPath`) · RX.3 member experience/nav · RX.4 Create-Your-PollPool
onboarding · RX.5 Tenant Dashboard + management IA + tenant self-service settings
(additive) · RX.6 Super Admin entry integration · RX.7 cross-role + custom-domain +
security hardening (incl. the LOW loader gate) · RX.8 browser verification + tests +
docs + completion gate.
