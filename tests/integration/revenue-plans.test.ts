// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/**
 * Phase 8-B.5 GRE.1 — Revenue Plans drive the split as a new tier, without any
 * billing rewrite. Assignment history is immutable; historical earnings are
 * unaffected (the split is recorded at earn time by the existing ledger).
 */
d("Revenue Plans — economics tier + immutable history", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let userId = "";

  const split = (tenant: string, creator: string, type: string) =>
    admin.rpc("effective_revenue_split" as never, { p_tenant: tenant, p_creator: creator, p_type: type } as never) as unknown as Rpc<
      { creator_bps: number; platform_bps: number }[]
    >;

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `rp-${s}`, display_name: "RP Tenant" } as never).select("id").single();
    tenantId = t!.id;
    userId = await createUser(`rp-${s}@rp.test`, "Password123!");
  });

  afterAll(async () => {
    if (userId) await deleteUser(userId);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("auto-assigns the default plan (Starter) to a new tenant", async () => {
    const { data } = await admin
      .from("tenant_revenue_plan_assignments")
      .select("assignment_type, revenue_plans(key)")
      .eq("tenant_id", tenantId)
      .is("ended_at", null)
      .single();
    const plan = Array.isArray(data!.revenue_plans) ? data!.revenue_plans[0] : data!.revenue_plans;
    expect(plan!.key).toBe("starter");
    expect(data!.assignment_type).toBe("initial");
  });

  it("resolves the split from the tenant's plan share (not just the default)", async () => {
    // Starter creator_support = 80/20.
    const start = await split(tenantId, randomUUID(), "creator_support");
    expect(start.data![0]).toMatchObject({ creator_bps: 8000, platform_bps: 2000 });

    // Upgrade to Champion (88/12) and the split follows the plan.
    const { error } = await admin.rpc("assign_revenue_plan" as never, {
      p_tenant: tenantId, p_plan_key: "champion", p_type: "automatic_upgrade", p_reason: "test",
    } as never);
    expect(error).toBeNull();
    const champ = await split(tenantId, randomUUID(), "creator_support");
    expect(champ.data![0]).toMatchObject({ creator_bps: 8800, platform_bps: 1200 });
  });

  it("keeps assignment history immutable (old row closed, not rewritten)", async () => {
    const { data } = await admin
      .from("tenant_revenue_plan_assignments")
      .select("assignment_type, ended_at, revenue_plans(key)")
      .eq("tenant_id", tenantId)
      .order("assigned_at", { ascending: true });
    const rows = data ?? [];
    const keys = rows.map((a) => (Array.isArray(a.revenue_plans) ? a.revenue_plans[0] : a.revenue_plans)?.key);
    expect(keys).toEqual(["starter", "champion"]);
    // The starter row is closed; champion is current.
    expect(rows[0]!.ended_at).not.toBeNull();
    expect(rows[1]!.ended_at).toBeNull();
  });

  it("lets a per-creator revenue rule override the plan share", async () => {
    // Insert a creator + rule (needs real user references).
    const { data: c } = await admin
      .from("creators")
      .insert({ tenant_id: tenantId, owner_user_id: userId, display_name: "C", slug: `c-${s}`, verification_status: "verified" } as never)
      .select("id")
      .single();
    await admin.from("creator_revenue_rules").insert({
      tenant_id: tenantId, creator_id: c!.id, product_type: "creator_support",
      creator_share_basis_points: 9900, platform_share_basis_points: 100,
      created_by: userId,
    } as never);
    const r = await split(tenantId, c!.id, "creator_support");
    expect(r.data![0]).toMatchObject({ creator_bps: 9900, platform_bps: 100 });
  });

  it("treats re-assigning the same plan as a no-op (no new history row)", async () => {
    const before = await admin.from("tenant_revenue_plan_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    await admin.rpc("assign_revenue_plan" as never, { p_tenant: tenantId, p_plan_key: "champion", p_type: "manual", p_reason: "again" } as never);
    const after = await admin.from("tenant_revenue_plan_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    expect(after.count).toBe(before.count);
  });

  it("never gives Platform Support (platform_premium) a revenue share", async () => {
    const { data } = await admin.from("revenue_plan_shares").select("id").eq("product_type", "platform_premium");
    expect(data ?? []).toHaveLength(0);
  });

  it("refuses plan assignment from a non-super-admin", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("assign_revenue_plan" as never, {
      p_tenant: tenantId, p_plan_key: "legend", p_type: "manual", p_reason: "nope",
    } as never);
    expect(error).not.toBeNull();
  });
});
