# Prediction Engine

A generic, multi-tenant **social prediction platform**. One codebase and one
database power many independent branded communities. The first reference tenant
is a marble-racing community (**Marble Grand Prix**), but nothing in the core is
hard-coded to marbles — verticals (football, motorsport, esports, awards,
elections, …) are **configuration + adapters**, never forks.

> Predictions are free. There is **no** real-money wagering, wallet, odds, or
> payout anywhere in the system. Percentages shown are **community sentiment**,
> never probability.

## Core domain

```
Tenant → Competition → Stage → Event → Competitors
       → Market → Options → Prediction → Result → Settlement
       → Statistics → Leaderboards
```

Everything tenant-owned carries `tenant_id`, and **Row Level Security** makes
cross-tenant access structurally impossible. Server code never trusts a
client-supplied tenant id or role — both are resolved server-side.

## Tech stack

- **Next.js 16** (App Router) · **TypeScript** (strict) · **Tailwind CSS v4**
- **Supabase**: Postgres, Auth, RLS, Storage
- **TanStack Query** · **Zod** · **React Hook Form**
- **Vitest** (unit + integration) · **Playwright** (e2e)

## Prerequisites

- Node 20+ (developed on 24), npm
- Docker (for local Supabase)
- Supabase CLI via `npx supabase` (no global install needed)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start local Supabase (Postgres + Auth + Studio). Applies migrations + seed.
npm run db:start        # equivalently: npx supabase start

# 3. Copy env and fill in the keys printed by `db:start`
cp .env.example .env.local
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 4. Run the app
npm run dev             # http://localhost:3000
```

Visit `http://localhost:3000` for the platform directory, or
`http://localhost:3000/t/marbles` for the reference tenant.

### Local ports

This project runs Supabase on a non-default port block (**5433x**) so it can
coexist with other local Supabase projects. See `supabase/config.toml`. The DB
is on `54332`, Studio on `54333`, the API gateway on `54331`.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the app (dev) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | All Vitest tests |
| `npm run test:unit` | Unit tests only (no DB required) |
| `npm run test:integration` | Integration tests (needs local Supabase) |
| `npm run test:e2e` | Playwright end-to-end |
| `npm run verify` | typecheck + lint + unit tests |
| `npm run db:start` / `db:stop` | Local Supabase up/down |
| `npm run db:reset` | Re-apply all migrations + seed |
| `npm run db:types` | Regenerate `src/types/database.ts` |

## Tenant resolution

Three forms, all resolved server-side in `src/proxy.ts`:

1. **Subdomain** — `marbles.predictionengine.example`
2. **Custom domain** — `marblesleague.com` (via `tenant_domains`)
3. **Dev path** — `localhost:3000/t/marbles`

## Repository layout

```
src/
  app/                     App Router routes (platform + /t/[tenantSlug])
  components/              UI primitives, providers, domain components
  lib/
    supabase/              server / client / admin clients + proxy helper
    tenant/                resolver, context, feature-flag service, membership
    auth/                  session helpers, auth server actions
  types/                   enums (source of truth) + generated database types
supabase/
  migrations/              numbered SQL (schema, RLS, grants)
  seed.sql                 reference tenant
tests/{unit,integration,e2e}/
docs/                      architecture, isolation, schema, security, decisions
```

## Documentation

See [`docs/`](docs/): [architecture](docs/architecture.md),
[tenant isolation](docs/tenant-isolation.md),
[database schema](docs/database-schema.md),
[role/permission matrix](docs/role-permission-matrix.md),
[security checklist](docs/security-checklist.md),
[decisions & assumptions](docs/decisions.md).

## Status

Built phase-by-phase (see `docs/decisions.md` for the plan). **Phase 1
(Foundation)** is complete: tenancy schema, RLS isolation, auth, tenant
resolver, theme system, and the app shell — all typechecked, linted, and tested.
