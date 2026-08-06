import { describe, it, expect } from "vitest";
import { integrationEnvReady, allowIntegrationSkip } from "./helpers";

/**
 * CI database enforcement (§11). Every other integration suite is gated on
 * `integrationEnvReady` and will `describe.skip` without a database. That is safe
 * for local dev but dangerous in CI: a run missing DB credentials would report
 * green having exercised zero settlement/billing/RLS/jobs/reconciliation behavior.
 *
 * This guard makes that impossible. If the DB env is absent, the run is only
 * allowed to proceed when ALLOW_INTEGRATION_TEST_SKIP is explicitly set (local
 * dev opt-out). In CI (where it defaults false) this test FAILS instead, so a
 * silently-skipped integration run can never be green.
 */
describe("integration environment guard", () => {
  it("has database credentials, or skipping is explicitly allowed", () => {
    if (integrationEnvReady) {
      expect(integrationEnvReady).toBe(true);
      return;
    }
    expect(
      allowIntegrationSkip,
      "Integration DB env is missing and ALLOW_INTEGRATION_TEST_SKIP is not set. " +
        "Refusing to skip integration tests silently — provision the database (npm run db:start) " +
        "or set ALLOW_INTEGRATION_TEST_SKIP=true for a local run without a DB.",
    ).toBe(true);
  });
});
