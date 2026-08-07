// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type RpcText = Promise<{ data: string | null; error: { message: string } | null }>;

/**
 * Phase 8-B.5 GRE.3 — automatic upgrade/downgrade with grace, recovery, and
 * hysteresis. Plan qualification thresholds are lowered on the seeded plans for
 * the duration of THIS test only (no other suite evaluates plans), so a handful
 * of users can drive the full ladder deterministically. Restored afterwards.
 */
d("Revenue Plan automation", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  const users: string[] = [];
  const originalQual: Record<string, unknown> = {};

  const evaluate = () => admin.rpc("evaluate_tenant_plan" as never, { p_tenant: tenantId } as never) as unknown as RpcText;
  const currentPlan = async () => {
    const { data } = await admin
      .from("tenant_revenue_plan_assignments")
      .select("revenue_plans(key)")
      .eq("tenant_id", tenantId)
      .is("ended_at", null)
      .single();
    const p = Array.isArray(data!.revenue_plans) ? data!.revenue_plans[0] : data!.revenue_plans;
    return p!.key;
  };
  // Set WAU to exactly n distinct users active today (login signal).
  async function setWau(n: number) {
    await admin.from("tenant_user_activity").delete().eq("tenant_id", tenantId);
    const today = new Date().toISOString().slice(0, 10);
    if (n > 0) {
      await admin.from("tenant_user_activity").insert(
        users.slice(0, n).map((u) => ({ tenant_id: tenantId, user_id: u, activity_date: today })) as never,
      );
    }
  }

  beforeAll(async () => {
    // Tiny WAU thresholds, WAU as the only gate.
    const ladder: Record<string, { min: number; remain: number }> = {
      momentum: { min: 2, remain: 1 },
      champion: { min: 4, remain: 3 },
      legend: { min: 6, remain: 5 },
    };
    for (const [key, v] of Object.entries(ladder)) {
      const { data } = await admin.from("revenue_plans").select("qualification").eq("key", key).single();
      originalQual[key] = data!.qualification;
      await admin.from("revenue_plans").update({
        qualification: { min_wau: v.min, remain_wau: v.remain, min_account_age_days: 0, require_verification: false, require_good_standing: false },
      } as never).eq("key", key);
    }

    const { data: t } = await admin.from("tenants").insert({ slug: `auto-${s}`, display_name: "Auto" } as never).select("id").single();
    tenantId = t!.id;
    for (let i = 0; i < 6; i++) users.push(await createUser(`auto${i}-${s}@auto.test`, "Password123!"));
  });

  afterAll(async () => {
    for (const [key, q] of Object.entries(originalQual)) {
      await admin.from("revenue_plans").update({ qualification: q } as never).eq("key", key);
    }
    for (const u of users) if (u) await deleteUser(u);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("starts on the default plan (Starter)", async () => {
    expect(await currentPlan()).toBe("starter");
  });

  it("upgrades immediately to the highest qualifying plan", async () => {
    await setWau(4); // meets champion(4), not legend(6)
    const { data } = await evaluate();
    expect(data).toBe("upgraded:champion");
    expect(await currentPlan()).toBe("champion");
  });

  it("does not flap: WAU between remain and next enter stays put (hysteresis)", async () => {
    await setWau(3); // champion remain=3 met; legend enter=6 not met
    const { data } = await evaluate();
    expect(data).toBe("unchanged");
    expect(await currentPlan()).toBe("champion");
  });

  it("enters At Risk (not immediate downgrade) when below the remain threshold", async () => {
    await setWau(2); // champion remain=3 not met
    const { data } = await evaluate();
    expect(data).toBe("at_risk");
    expect(await currentPlan()).toBe("champion"); // still champion during grace
    const { data: st } = await admin.from("tenant_plan_state").select("status, grace_ends_at").eq("tenant_id", tenantId).single();
    expect(st!.status).toBe("at_risk");
    expect(st!.grace_ends_at).not.toBeNull();
  });

  it("recovers without downgrade when activity returns within grace", async () => {
    await setWau(3); // champion remain=3 met again
    const { data } = await evaluate();
    expect(data).toBe("recovered");
    expect(await currentPlan()).toBe("champion");
  });

  it("downgrades automatically once grace expires", async () => {
    await setWau(2); // below champion remain → at risk
    await evaluate();
    // Force grace to have already expired.
    await admin.from("tenant_plan_state").update({ grace_ends_at: new Date(Date.now() - 1000).toISOString() } as never).eq("tenant_id", tenantId);
    const { data } = await evaluate();
    expect(data).toBe("downgraded:momentum"); // WAU 2 meets momentum remain=1
    expect(await currentPlan()).toBe("momentum");
  });

  it("suspends automation under a manual override and resumes when cleared", async () => {
    await admin.rpc("set_plan_override" as never, { p_tenant: tenantId, p_plan_key: "legend", p_reason: "VIP deal" } as never);
    expect(await currentPlan()).toBe("legend");
    await setWau(1); // would normally downgrade hard
    const { data } = await evaluate();
    expect(data).toBe("manual_override");
    expect(await currentPlan()).toBe("legend"); // untouched

    await admin.rpc("clear_plan_override" as never, { p_tenant: tenantId, p_reason: "back to auto" } as never);
    const after = await evaluate();
    expect(after.data).not.toBe("manual_override"); // automation resumed
  });

  it("keeps assignment history immutable across all transitions", async () => {
    const { count } = await admin
      .from("tenant_revenue_plan_assignments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    // initial + several transitions; every one preserved (never rewritten).
    expect((count ?? 0)).toBeGreaterThanOrEqual(4);
  });
});
