/**
 * Versioned engine behavior (Phase 8B.7).
 *
 * Version branching is deliberately TINY. `EngineBehavior` is a small typed set of
 * parameters resolved from a tenant's pinned engine version; gated code reads it
 * instead of branching on the version string inline. Adding a version means adding
 * one row here and documenting the difference in docs/versioning.md — the engine
 * is never duplicated.
 *
 * SCOPE: per the Phase 8-B rules, settlement / scoring / grading / leaderboard /
 * notification behavior (all authoritative in SQL) is NOT versioned here — doing
 * so from TS would desync from the database. Versioned behavior is confined to
 * surfaces where TS is authoritative and there is no SQL counterpart to diverge
 * from (currently: prediction-lock DISPLAY state). Actual lock ENFORCEMENT is
 * unchanged and identical across versions.
 *
 * Every field MUST be documented with the version(s) it differs in.
 */
import { type EngineVersion } from "./version";

export type EngineBehavior = {
  /**
   * Milliseconds before lock at which an open market is DISPLAYED as "closing
   * soon" (a distinct badge). Null disables the state entirely.
   *   - 1.0: null       — markets show only Open / Locked.
   *   - 1.1: 900_000    — markets within 15 minutes of lock show "Closing soon".
   * Display only: the moment a prediction is actually rejected is unchanged.
   */
  lockClosingSoonMs: number | null;
};

const ENGINE_BEHAVIORS: Record<EngineVersion, EngineBehavior> = {
  "1.0": { lockClosingSoonMs: null },
  "1.1": { lockClosingSoonMs: 15 * 60 * 1000 },
};

/** Resolve the behavior parameters for a tenant's pinned engine version. */
export function getEngineBehavior(version: EngineVersion): EngineBehavior {
  return ENGINE_BEHAVIORS[version];
}
