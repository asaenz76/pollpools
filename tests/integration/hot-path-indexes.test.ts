// @vitest-environment node
import { describe, it, expect } from "vitest";
import { adminClient, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 8-C F-20 — the prediction/sentiment/feed hot reads depend on specific
 * indexes (verified serving those queries via EXPLAIN). This guard fails if any
 * is dropped.
 */
d("Hot-path index guard (F-20)", () => {
  it("has all supporting indexes for the hot read paths", async () => {
    const admin = adminClient();
    const { data, error } = await admin.rpc("hot_path_indexes_ok" as never);
    expect(error).toBeNull();
    expect(data).toBe(true);
  });
});
