import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Configuration Engine — platform-default tier.
 *
 * Prediction Engine resolves configuration in tiers, most specific first:
 *
 *   record rule → tenant setting/flag → PLATFORM DEFAULT
 *
 * Feature flags (`tenant_feature_flags` via `FeatureFlagService`), typed tenant
 * settings (`tenant_settings`), and record rules (`scoring_rules`,
 * `creator_revenue_rules`, `billing_products`) already exist. This module is the
 * bottom tier: the single `platform_config` row holding platform-wide defaults
 * that used to be hard-coded literals. It is intentionally NOT a generic config
 * DSL — each field is a real default with a real consumer; new fields are added
 * here as their consumers arrive.
 */
export type PlatformConfig = {
  defaultCreatorShareBps: number;
  defaultPlatformShareBps: number;
};

// Resilience default if the singleton row is somehow absent (it is seeded by
// migration 0031). Kept equal to the seeded values, not an independent policy.
const RESILIENCE_DEFAULT: PlatformConfig = { defaultCreatorShareBps: 8000, defaultPlatformShareBps: 2000 };

export const getPlatformConfig = cache(async (): Promise<PlatformConfig> => {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("platform_config")
    .select("default_creator_share_bps, default_platform_share_bps")
    .maybeSingle();
  if (!data) return RESILIENCE_DEFAULT;
  return {
    defaultCreatorShareBps: data.default_creator_share_bps,
    defaultPlatformShareBps: data.default_platform_share_bps,
  };
});
