# Versioned Engine API

Prediction Engine powers many independent tenants from one codebase. A change to
how the engine *behaves* — settlement, scoring, market grading, statistics,
leaderboards, draft rules — must never silently change results for a tenant that
was running fine. Engine versioning is the contract that guarantees this.

## The contract

- **Every tenant is pinned to one engine version** (`tenants.engine_version`),
  e.g. `1.0`. **Never `"latest"`.** A DB check constraint (`^[0-9]+\.[0-9]+$`)
  structurally rejects `latest` and any non-numeric value.
- **New tenants snapshot to the current version** at creation
  (`CURRENT_ENGINE_VERSION`, mirrored by `platform_config.default_engine_version`).
  They are **not** auto-upgraded when the engine ships a new version.
- **The running engine declares which versions it supports**
  (`SUPPORTED_ENGINE_VERSIONS` in `src/lib/engine/version.ts`) — the single source
  of truth. `resolveEngineVersion()` maps a stored value to a supported version.
- **Behavior changes are gated on the resolved version.** When a slice changes
  engine behavior, it branches on the tenant's version and keeps the old path for
  tenants pinned to the old version.

```
tenant.engine_version  ─resolveEngineVersion→  EngineVersion  ─gates→  engine behavior
        (pinned, never "latest")                (supported)            (per-version)
```

`getTenantContext()` resolves `engineVersion` onto the tenant, so every server
path already has the tenant's version available to gate on.

## What versioning applies to

Settlement · scoring · competition behavior · market grading · statistics ·
leaderboards · draft rules · future engine modules. Any of these that changes
observable results across a version boundary must be version-gated.

## Adding a new engine version

1. Append the version to `SUPPORTED_ENGINE_VERSIONS` and (when it becomes the
   default for new tenants) update `CURRENT_ENGINE_VERSION` +
   `platform_config.default_engine_version`.
2. Implement the new behavior **behind a version branch**; keep the prior branch
   for tenants still pinned to the old version.
3. Migrating an existing tenant to a new version is an explicit, opt-in action
   (a future admin operation), never automatic.

## Current state

`1.0` is the only version. This slice establishes the storage, the "never latest"
guarantee, the platform default, and the resolution path used by every request.
Behavior branches are introduced by the slices that change engine behavior
(§3/§4 grading & scoring, §5/§6 settlement), each gating on the pinned version.
