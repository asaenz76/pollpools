// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 8-B.5 GRE.5 — Success Timeline records POSITIVE milestones only,
 * deterministically and idempotently, and never rewrites history.
 */
d("Success Timeline", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";

  const detect = () => admin.rpc("detect_success_milestones", { p_tenant: tenantId } as never);
  const entries = async () => (await admin.from("tenant_success_timeline").select("type, category, title, dedupe_key").eq("tenant_id", tenantId)).data ?? [];

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `tl-${s}`, display_name: "TL" } as never).select("id").single();
    tenantId = t!.id;
    // Simulate an automatic upgrade to Champion + WAU state.
    const { data: champ } = await admin.from("revenue_plans").select("id").eq("key", "champion").single();
    await admin.from("tenant_revenue_plan_assignments").update({ ended_at: new Date().toISOString() } as never).eq("tenant_id", tenantId).is("ended_at", null);
    await admin.from("tenant_revenue_plan_assignments").insert({ tenant_id: tenantId, plan_id: champ!.id, assignment_type: "automatic_upgrade", reason: "test" } as never);
    await admin.from("tenant_plan_state").insert({ tenant_id: tenantId, current_wau: 1200, status: "qualified" } as never);
  });

  afterAll(async () => {
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("records positive milestones deterministically", async () => {
    await detect();
    const e = await entries();
    const keys = e.map((x) => x.dedupe_key);
    expect(keys).toContain("plan:champion"); // reached Champion
    expect(keys).toContain("wau:100");
    expect(keys).toContain("wau:500");
    expect(keys).toContain("wau:1000");
    expect(keys).not.toContain("wau:5000"); // not yet reached
    // Every entry is a celebration, never a negative/routine event.
    for (const x of e) {
      expect(["revenue_plan", "audience", "community_health", "support", "draft", "competitions", "platform"]).toContain(x.category);
      expect(x.title.toLowerCase()).not.toMatch(/downgrad|fail|error|expired|lost/);
    }
  });

  it("is idempotent — re-detection adds no duplicates", async () => {
    const before = (await entries()).length;
    await detect();
    await detect();
    const after = (await entries()).length;
    expect(after).toBe(before);
  });

  it("never records a negative event on downgrade", async () => {
    // A downgrade assignment must not create a timeline entry.
    const { data: starter } = await admin.from("revenue_plans").select("id").eq("key", "starter").single();
    await admin.from("tenant_revenue_plan_assignments").update({ ended_at: new Date().toISOString() } as never).eq("tenant_id", tenantId).is("ended_at", null);
    await admin.from("tenant_revenue_plan_assignments").insert({ tenant_id: tenantId, plan_id: starter!.id, assignment_type: "automatic_downgrade", reason: "test" } as never);
    const before = (await entries()).length;
    await detect();
    const after = await entries();
    expect(after.length).toBe(before); // no new entry for the downgrade
    expect(after.map((x) => x.dedupe_key)).not.toContain("plan:starter");
  });
});
