# Architecture Overview

## Shape

A **single Next.js application** talks to a **single Postgres database** and
serves **many isolated tenants**. There are no per-module microservices. The
same code renders every tenant; branding, features, and content come from
tenant configuration.

```
Browser ──▶ Next.js (App Router)
              │   proxy.ts: refresh session + resolve tenant (host/path)
              │   Server Components / Server Actions / Route Handlers
              ▼
          Supabase
            ├─ Auth (email/password)
            ├─ Postgres + RLS  ◀── the isolation backstop
            └─ Storage (avatars, covers, private verification docs)
```

## Layers

- **Routing / tenancy** (`src/proxy.ts`, `src/lib/tenant/*`): resolve the tenant
  server-side, load its context (settings + typed feature flags), and 404 on
  unknown tenants.
- **Data access** (`src/lib/supabase/*`): three clients — `server` (RLS,
  cookies), `client` (browser anon), `admin` (service role, server-only).
- **Domain logic** (`src/lib/domain/*`, added per phase): pure, unit-tested
  functions for sentiment, scoring, streaks, brackets; and DB functions +
  transactions for settlement, leaderboards, and other sensitive transitions.
- **UI** (`src/components/*`, `src/app/*`): mobile-first, social-style,
  ~95% grayscale design system (see spec §24), light/dark via `next-themes`.

## Why the engines live where they do

Sensitive, correctness-critical operations run **in the database** (functions,
constraints, transactions, row-level locking, unique keys) rather than in
application code, because that is where atomicity and idempotency are cheapest to
guarantee:

- **Locking** — server-time gate enforced at write time, never the client clock.
- **Settlement** — atomic + versioned + idempotent; `(event_id, grading_version)`
  uniqueness, row locks, compensating grades for regrade. Never edits history.
- **Sentiment** — deterministic largest-remainder rounding to exactly 100%.
- **Subscriptions** — signed webhooks + idempotency keys (replay-safe).

Pure, deterministic pieces (sentiment math, scoring rules, bracket advancement,
tie-breaking) are also implemented as **pure TS functions** so they can be
unit-tested in isolation and shared between server and client.

## Extension points (for future verticals)

A new vertical connects without touching the core:

1. **Tenant configuration** — slug, branding, timezone, feature flags,
   enabled competition types.
2. **Competition configuration** — which of STANDALONE/SEASON/TOURNAMENT/BRACKET.
3. **Event adapter** — how events are described (metadata JSONB) and where their
   video/stream lives.
4. **Result adapter** — a `result_source_type` (creator_manual, webhook,
   external_provider, future_adapter) feeding the same idempotent settlement.
5. **Optional monetization module** — premium / creator support / sponsorships,
   with configurable revenue split (basis points, never hard-coded in UI).

See [future-adapter guide] (added in Phase 10) for a worked example.
