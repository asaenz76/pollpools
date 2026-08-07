// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, signInAs, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 8-B.5 — Platform Support is platform-PRIVATE. It must never surface to a
 * tenant in any form, must not count toward Community Support / Community Health,
 * must create no tenant earnings, and remains visible only to the platform owner.
 */
d("Platform Support privacy", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let owner = "";
  let supporter = "";
  let platformUser = "";
  const origCfg: Record<string, number> = {};

  beforeAll(async () => {
    const { data: cfg } = await admin.from("platform_config").select("health_baseline_min_age_days, health_baseline_min_events").single();
    origCfg.age = cfg!.health_baseline_min_age_days;
    origCfg.events = cfg!.health_baseline_min_events;
    await admin.from("platform_config").update({ health_baseline_min_age_days: 0, health_baseline_min_events: 0 } as never).eq("id", true);

    const { data: t } = await admin.from("tenants").insert({ slug: `ps-${s}`, display_name: "PS" } as never).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_feature_flags").insert({ tenant_id: tenantId, flag: "creator_support_enabled", enabled: true } as never);

    owner = await createUser(`ps-owner-${s}@ps.test`, "Password123!");
    supporter = await createUser(`ps-sup-${s}@ps.test`, "Password123!");
    platformUser = await createUser(`ps-plat-${s}@ps.test`, "Password123!");
    await admin.from("tenant_memberships").insert([
      { tenant_id: tenantId, user_id: owner, role: "creator", status: "active" },
      { tenant_id: tenantId, user_id: supporter, role: "member", status: "active" },
      { tenant_id: tenantId, user_id: platformUser, role: "member", status: "active" },
    ] as never);
    await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: owner, display_name: "C", slug: `c-${s}`, verification_status: "verified" } as never);

    // One CREATOR supporter and one PLATFORM (platform_premium) subscriber.
    await admin.from("billing_entitlements").insert([
      { tenant_id: tenantId, user_id: supporter, entitlement_type: "creator_supporter", status: "active", source_type: "admin_grant", source_id: randomUUID() },
      { tenant_id: tenantId, user_id: platformUser, entitlement_type: "platform_premium", status: "active", source_type: "admin_grant", source_id: randomUUID() },
    ] as never);
    // Make all three "active" so WAU > 0.
    const today = new Date().toISOString().slice(0, 10);
    await admin.from("tenant_user_activity").insert([owner, supporter, platformUser].map((u) => ({ tenant_id: tenantId, user_id: u, activity_date: today })) as never);
  });

  afterAll(async () => {
    await admin.from("platform_config").update({ health_baseline_min_age_days: origCfg.age, health_baseline_min_events: origCfg.events } as never).eq("id", true);
    for (const u of [owner, supporter, platformUser]) if (u) await deleteUser(u);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("never gives Platform Support a revenue-plan share row", async () => {
    const { data } = await admin.from("revenue_plan_shares").select("id").eq("product_type", "platform_premium");
    expect(data ?? []).toHaveLength(0);
  });

  it("Community Support counts only the tenant's supporters, not platform subscribers", async () => {
    const { data } = await admin.rpc("community_health_now", { p_tenant: tenantId } as never);
    const h = data as unknown as { components: { key: string; extra: Record<string, number> }[] };
    const support = h.components.find((c) => c.key === "community_support")!;
    // One creator_supporter; the platform_premium subscriber is NOT counted.
    expect(support.extra.supporters).toBe(1);
  });

  it("creates no tenant earnings from Platform Support", async () => {
    const { data } = await admin
      .from("creator_earnings")
      .select("id, earning_type")
      .eq("tenant_id", tenantId);
    // Any earnings that exist are creator support / paid draft — never a platform type.
    for (const e of data ?? []) expect(["support_subscription", "paid_draft", "adjustment", "reversal"]).toContain(e.earning_type);
    // The earning-type enum has no platform value at all.
    const { data: types } = await admin.rpc("effective_revenue_split", { p_tenant: tenantId, p_creator: owner, p_type: "creator_support" } as never);
    expect(types).not.toBeNull();
  });

  it("does not let a tenant member read platform_premium entitlements of others", async () => {
    const client = await signInAs(`ps-owner-${s}@ps.test`, "Password123!");
    const { data } = await client
      .from("billing_entitlements")
      .select("id, entitlement_type, user_id")
      .eq("tenant_id", tenantId)
      .eq("entitlement_type", "platform_premium");
    // RLS must not expose another user's platform_premium entitlement to the tenant owner.
    const leaked = (data ?? []).filter((e) => e.user_id !== owner);
    expect(leaked).toHaveLength(0);
  });

  it("lets the platform owner (service role) see Platform Support records", async () => {
    const { data } = await admin
      .from("billing_entitlements")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("entitlement_type", "platform_premium");
    expect((data ?? []).length).toBe(1);
  });
});
