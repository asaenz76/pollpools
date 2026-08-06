/**
 * Versioned Engine API (§13).
 *
 * Every tenant is pinned to one engine version — never "latest". Behavior changes
 * to settlement, scoring, grading, statistics, leaderboards, or draft rules must
 * be gated on the tenant's version so existing tenants' results never change
 * silently. New tenants snapshot to `CURRENT_ENGINE_VERSION` at creation.
 *
 * This module is the single source of truth for which versions the running engine
 * supports. Adding a version is a deliberate act: append it here, add the gated
 * behavior, and leave existing tenants on their pinned version.
 */
export const SUPPORTED_ENGINE_VERSIONS = ["1.0"] as const;
export type EngineVersion = (typeof SUPPORTED_ENGINE_VERSIONS)[number];

/** The version new tenants are created at. Must be a supported version. */
export const CURRENT_ENGINE_VERSION: EngineVersion = "1.0";

export function isSupportedEngineVersion(v: string): v is EngineVersion {
  return (SUPPORTED_ENGINE_VERSIONS as readonly string[]).includes(v);
}

/**
 * Resolve a stored engine-version string to a supported version. An absent or
 * unrecognized value falls back to the current version defensively (the DB check
 * constraint already forbids "latest" and non-numeric values at write time).
 */
export function resolveEngineVersion(stored: string | null | undefined): EngineVersion {
  return stored && isSupportedEngineVersion(stored) ? stored : CURRENT_ENGINE_VERSION;
}
