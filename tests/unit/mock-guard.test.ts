import { describe, it, expect, vi, afterEach } from "vitest";
import { mockBillingUnavailable } from "@/lib/billing/mock-guard";

/** Mock billing surfaces must be hard-blocked in production (§12.1, F-24 hardening). */
describe("mockBillingUnavailable", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("blocks in production (independent of BILLING_PROVIDER)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(mockBillingUnavailable()).toBe(true);
  });

  it("is available outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(mockBillingUnavailable()).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(mockBillingUnavailable()).toBe(false);
  });
});
