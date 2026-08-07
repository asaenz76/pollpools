// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 8-B.5 GRE.7 — growth notifications fire from state changes with per-
 * transition dedup (anti-spam via the notifications unique (tenant_id,
 * dedupe_key)). Driven directly through the state tables so this suite never
 * mutates shared plan configuration.
 */
d("Growth notifications", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let owner = "";
  let champId = "";
  let starterId = "";

  const notifs = async (type: string) =>
    (await admin.from("notifications").select("id, title, body").eq("tenant_id", tenantId).eq("user_id", owner).eq("type", type as never)).data ?? [];
  const endCurrent = () => admin.from("tenant_revenue_plan_assignments").update({ ended_at: new Date().toISOString() } as never).eq("tenant_id", tenantId).is("ended_at", null);
  const assign = (planId: string, type: string) => admin.from("tenant_revenue_plan_assignments").insert({ tenant_id: tenantId, plan_id: planId, assignment_type: type, reason: "test" } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `gn-${s}`, display_name: "GN" } as never).select("id").single();
    tenantId = t!.id;
    owner = await createUser(`gn-${s}@gn.test`, "Password123!");
    await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: owner, display_name: "C", slug: `c-${s}`, verification_status: "verified" } as never);
    champId = (await admin.from("revenue_plans").select("id").eq("key", "champion").single()).data!.id;
    starterId = (await admin.from("revenue_plans").select("id").eq("key", "starter").single()).data!.id;
    await admin.from("tenant_plan_state").insert({ tenant_id: tenantId, status: "qualified", current_wau: 0 } as never);
  });

  afterAll(async () => {
    if (owner) await deleteUser(owner);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("celebrates an automatic upgrade (once, deduped)", async () => {
    await endCurrent();
    await assign(champId, "automatic_upgrade");
    let n = await notifs("plan_upgraded");
    expect(n.length).toBe(1);
    expect(n[0]!.title.toLowerCase()).toMatch(/congratulations|reached/);
    // Re-upgrade to the same plan → deduped (still one).
    await endCurrent();
    await assign(champId, "automatic_upgrade");
    n = await notifs("plan_upgraded");
    expect(n.length).toBe(1);
  });

  it("sends a helpful At Risk notice and a positive recovery notice", async () => {
    await admin.from("tenant_plan_state").update({ status: "at_risk", at_risk_since: new Date().toISOString() } as never).eq("tenant_id", tenantId);
    const atRisk = await notifs("plan_at_risk");
    expect(atRisk.length).toBe(1);
    expect((atRisk[0]!.body ?? "").toLowerCase()).toMatch(/recover|grace/);
    expect((atRisk[0]!.body ?? "").toLowerCase()).not.toMatch(/community health/); // never implies health controls the plan

    await admin.from("tenant_plan_state").update({ status: "qualified" } as never).eq("tenant_id", tenantId);
    const recovered = await notifs("plan_recovered");
    expect(recovered.length).toBe(1);
  });

  it("sends a factual, non-punitive downgrade notice", async () => {
    await endCurrent();
    await assign(starterId, "automatic_downgrade");
    const n = await notifs("plan_downgraded");
    expect(n.length).toBe(1);
    expect((n[0]!.body ?? "").toLowerCase()).not.toMatch(/fail|penalt|punish/);
  });

  it("notifies a WAU milestone once when crossed", async () => {
    await admin.from("tenant_plan_state").update({ current_wau: 150 } as never).eq("tenant_id", tenantId);
    let n = await notifs("wau_milestone");
    expect(n.length).toBe(1); // crossed 100, not 500
    // Crossing again upward within the same threshold → no duplicate.
    await admin.from("tenant_plan_state").update({ current_wau: 160 } as never).eq("tenant_id", tenantId);
    n = await notifs("wau_milestone");
    expect(n.length).toBe(1);
  });

  it("coaches on a Community Health band drop (not on trivial noise)", async () => {
    const mk = (date: string, band: string, score: number) =>
      admin.from("community_health_snapshots").insert({ tenant_id: tenantId, snapshot_date: date, status: "scored", overall_score: score, band_key: band, formula_version: 1, components: [] } as never);
    await mk("2026-05-01", "healthy", 80);
    await mk("2026-05-02", "needs_attention", 70);
    const n = await notifs("health_needs_attention");
    expect(n.length).toBe(1);
    expect((n[0]!.body ?? "").toLowerCase()).toMatch(/suggestion|boost|dashboard/);
  });

  it("does not spam duplicate messages", async () => {
    const all = (await admin.from("notifications").select("dedupe_key").eq("tenant_id", tenantId).eq("user_id", owner)).data ?? [];
    const keys = all.map((x) => x.dedupe_key);
    expect(new Set(keys).size).toBe(keys.length); // every notification has a unique dedupe key
  });
});
