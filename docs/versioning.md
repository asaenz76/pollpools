# Versioned Engine API

> **Status: Runtime-branched (Phase 8B.7).** The pin and the never-`latest`
> guarantee below are enforced in the schema and resolver. Two versions are
> supported (`1.0`, `1.1`), and behavior now branches on the tenant's version via
> `src/lib/engine/behavior.ts` — existing tenants stay on their pinned version and
> are unaffected by newer ones. New tenants are still created at `1.0`
> (`CURRENT_ENGINE_VERSION`); bumping the default is a separate, deliberate change.

## Versioned behaviors

Version branching is deliberately tiny and confined to surfaces where TS is the
authority. Settlement / scoring / grading / leaderboard / notification behavior is
authoritative in SQL and is **not** branched from TS (that would desync from the
database). Every versioned behavior lives in `EngineBehavior` and is listed here:

| Behavior | 1.0 | 1.1 | Notes |
| --- | --- | --- | --- |
| `lockClosingSoonMs` — prediction-lock **display** state | `null` (Open / Locked only) | `900000` (markets within 15 min of lock show a "Closing soon" badge) | Display only. The moment a prediction is actually rejected (`canSubmitPrediction` / `submit_prediction`) is identical across versions. |

Adding a version: append it to `SUPPORTED_ENGINE_VERSIONS`, add a row to
`ENGINE_BEHAVIORS`, gate the code on the resolved `EngineBehavior` field (never on
the version string inline), and add a row to the table above.

Prediction Engine powers many independent tenants from one codebase. A change to
how the engine *behaves* — settlement, scoring, market grading, statistics,
leaderboards, draft rules — must never silently change results for a tenant that
was running fine. Engine versioning is the contract that *will* guarantee this.

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
