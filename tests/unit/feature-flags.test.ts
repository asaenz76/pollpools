import { describe, it, expect } from "vitest";
import {
  FeatureFlagService,
  FeatureDisabledError,
  FEATURE_FLAG_DEFAULTS,
} from "@/lib/tenant/feature-flags";

describe("FeatureFlagService", () => {
  it("uses documented defaults when unset", () => {
    const svc = new FeatureFlagService();
    expect(svc.isEnabled("predictions_enabled")).toBe(true);
    expect(svc.isEnabled("comments_enabled")).toBe(false);
    expect(svc.isEnabled("platform_premium_enabled")).toBe(false);
  });

  it("applies overrides", () => {
    const svc = new FeatureFlagService({ comments_enabled: true, predictions_enabled: false });
    expect(svc.isEnabled("comments_enabled")).toBe(true);
    expect(svc.isEnabled("predictions_enabled")).toBe(false);
  });

  it("builds from raw rows and ignores unknown flags", () => {
    const svc = FeatureFlagService.fromRows([
      { flag: "likes_enabled", enabled: true },
      { flag: "some_future_flag", enabled: true },
    ]);
    expect(svc.isEnabled("likes_enabled")).toBe(true);
    // Unknown flag ignored; known defaults preserved.
    expect(svc.isEnabled("sharing_enabled")).toBe(FEATURE_FLAG_DEFAULTS.sharing_enabled);
  });

  it("assertEnabled throws for disabled features", () => {
    const svc = new FeatureFlagService({ creator_support_enabled: false });
    expect(() => svc.assertEnabled("creator_support_enabled")).toThrow(FeatureDisabledError);
  });

  it("assertEnabled passes for enabled features", () => {
    const svc = new FeatureFlagService({ creator_support_enabled: true });
    expect(() => svc.assertEnabled("creator_support_enabled")).not.toThrow();
  });

  it("serializes a complete flag map", () => {
    const json = new FeatureFlagService().toJSON();
    expect(Object.keys(json)).toHaveLength(15);
  });
});
