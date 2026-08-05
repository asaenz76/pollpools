/**
 * Typed feature-flag service (spec §7).
 *
 * All tenant feature toggles funnel through here. UI and server code ask the
 * service — they never read raw flag rows or hard-code flag names inline. Unknown
 * or missing flags fall back to a documented default so a partially-configured
 * tenant still behaves predictably.
 */

export const FEATURE_FLAGS = [
  "predictions_enabled",
  "comments_enabled",
  "likes_enabled",
  "sharing_enabled",
  "creator_following_enabled",
  "achievements_enabled",
  "global_leaderboard_enabled",
  "creator_leaderboards_enabled",
  "season_leaderboards_enabled",
  "platform_premium_enabled",
  "creator_support_enabled",
  "sponsorships_enabled",
  "youtube_embeds_enabled",
  "prediction_editing_before_lock_enabled",
  "public_profiles_enabled",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/** Defaults applied when a tenant has not explicitly set a flag. */
export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  predictions_enabled: true,
  comments_enabled: false,
  likes_enabled: false,
  sharing_enabled: true,
  creator_following_enabled: true,
  achievements_enabled: true,
  global_leaderboard_enabled: true,
  creator_leaderboards_enabled: true,
  season_leaderboards_enabled: true,
  platform_premium_enabled: false,
  creator_support_enabled: false,
  sponsorships_enabled: false,
  youtube_embeds_enabled: true,
  prediction_editing_before_lock_enabled: true,
  public_profiles_enabled: true,
};

export type FeatureFlagOverrides = Partial<Record<FeatureFlag, boolean>>;

export function isFeatureFlag(value: string): value is FeatureFlag {
  return (FEATURE_FLAGS as readonly string[]).includes(value);
}

/**
 * Immutable, typed view over a tenant's flags. Construct once per request from
 * the resolved tenant and pass down; callers use `isEnabled` / `assertEnabled`.
 */
export class FeatureFlagService {
  private readonly flags: Record<FeatureFlag, boolean>;

  constructor(overrides: FeatureFlagOverrides = {}) {
    const resolved = { ...FEATURE_FLAG_DEFAULTS };
    for (const flag of FEATURE_FLAGS) {
      const override = overrides[flag];
      if (typeof override === "boolean") resolved[flag] = override;
    }
    this.flags = resolved;
  }

  /**
   * Build from a raw `tenant_feature_flags` row set (flag rows keyed by name).
   * Silently ignores unknown flag names so forward-compat rows don't throw.
   */
  static fromRows(
    rows: ReadonlyArray<{ flag: string; enabled: boolean }>,
  ): FeatureFlagService {
    const overrides: FeatureFlagOverrides = {};
    for (const row of rows) {
      if (isFeatureFlag(row.flag)) overrides[row.flag] = row.enabled;
    }
    return new FeatureFlagService(overrides);
  }

  isEnabled(flag: FeatureFlag): boolean {
    return this.flags[flag];
  }

  /** Throws when a required feature is disabled — used to guard server actions. */
  assertEnabled(flag: FeatureFlag): void {
    if (!this.flags[flag]) {
      throw new FeatureDisabledError(flag);
    }
  }

  toJSON(): Record<FeatureFlag, boolean> {
    return { ...this.flags };
  }
}

export class FeatureDisabledError extends Error {
  constructor(public readonly flag: FeatureFlag) {
    super(`Feature "${flag}" is not enabled for this tenant`);
    this.name = "FeatureDisabledError";
  }
}
