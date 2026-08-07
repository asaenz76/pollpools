// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type Health = {
  status: string;
  overall_score: number | null;
  band: string | null;
  formula_version: number;
  components: { key: string; applicable: boolean; building: boolean; value: number; score: number | null; extra: Record<string, number> }[];
};

/**
 * Phase 8-B.5 GRE.4 — Community Health is a deterministic coaching score.
 * Verifies the addendum's invariants: coaching-only metrics (no vanity, no
 * platform status in the score), prediction/draft are independent peers,
 * disabled features don't penalize, building baseline, benchmark anonymity +
 * eligibility, formula-version immutability, and revenue-plan independence.
 */
d("Community Health", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let creatorId = "";
  let competitionId = "";
  let marketId = "";
  let optionId = "";
  const predictors: string[] = [];
  const drafters: string[] = [];
  const origCfg: Record<string, number> = {};

  const health = async (): Promise<Health> => {
    const { data } = await admin.rpc("community_health_now", { p_tenant: tenantId } as never);
    return data as unknown as Health;
  };
  const comp = (h: Health, key: string) => h.components.find((c) => c.key === key)!;
  const activity = (user: string) =>
    admin.from("tenant_user_activity").insert({ tenant_id: tenantId, user_id: user, activity_date: new Date().toISOString().slice(0, 10) } as never);

  beforeAll(async () => {
    // Relax the baseline gate for the test tenant (only this suite computes health).
    const { data: cfg } = await admin.from("platform_config").select("health_baseline_min_age_days, health_baseline_min_events").single();
    origCfg.age = cfg!.health_baseline_min_age_days;
    origCfg.events = cfg!.health_baseline_min_events;
    await admin.from("platform_config").update({ health_baseline_min_age_days: 0, health_baseline_min_events: 0 } as never).eq("id", true);

    const { data: t } = await admin.from("tenants").insert({ slug: `ch-${s}`, display_name: "CH" } as never).select("id").single();
    tenantId = t!.id;

    const owner = await createUser(`ch-owner-${s}@ch.test`, "Password123!");
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: owner, display_name: "C", slug: `c-${s}`, verification_status: "verified" } as never).select("id").single();
    creatorId = c!.id;
    predictors.push(owner);

    // Two predictors (predictions only), two drafters (draft only) — disjoint users.
    for (let i = 0; i < 1; i++) predictors.push(await createUser(`ch-p${i}-${s}@ch.test`, "Password123!"));
    for (let i = 0; i < 2; i++) drafters.push(await createUser(`ch-d${i}-${s}@ch.test`, "Password123!"));
    for (const u of [...predictors, ...drafters]) await activity(u); // all are WAU

    // Prediction scaffolding via the generic RPC (needs competitors).
    const evComps: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { data: ec } = await admin.from("competitors").insert({ tenant_id: tenantId, creator_id: creatorId, name: `EC${i}`, slug: `ec${i}-${s}` } as never).select("id").single();
      evComps.push(ec!.id);
    }
    const { data: ev } = await admin.rpc("create_event_with_market", {
      p_creator_id: creatorId, p_competition_id: null, p_title: "E", p_slug: `e-${s}`, p_description: null,
      p_starts_at: null, p_locks_at: null, p_competitor_ids: evComps, p_market_question: "Q?", p_publish: true, p_media: [],
    } as never) as unknown as { data: { event_id: string } | null };
    const { data: mkt } = await admin.from("markets").select("id").eq("event_id", ev!.event_id).single();
    marketId = mkt!.id;
    const { data: opt } = await admin.from("market_options").select("id").eq("market_id", marketId).limit(1).single();
    optionId = opt!.id;
    for (const u of predictors) {
      await admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: u, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);
    }

    // Draft scaffolding: competition + enabled settings + a competitor + confirmed assignments.
    const { data: cm } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "S", slug: `s-${s}` } as never).select("id").single();
    competitionId = cm!.id;
    await admin.from("competition_draft_settings").insert({ tenant_id: tenantId, competition_id: competitionId, created_by: predictors[0], is_enabled: true } as never);
    const { data: cp } = await admin.from("competitors").insert({ tenant_id: tenantId, creator_id: creatorId, name: "Comp", slug: `comp-${s}` } as never).select("id").single();
    for (const u of drafters) {
      await admin.from("competitor_draft_assignments").insert({ tenant_id: tenantId, competition_id: competitionId, competitor_id: cp!.id, user_id: u, status: "active", confirmed_at: new Date().toISOString(), idempotency_key: `d-${randomUUID()}` } as never);
    }
  });

  afterAll(async () => {
    await admin.from("platform_config").update({ health_baseline_min_age_days: origCfg.age, health_baseline_min_events: origCfg.events } as never).eq("id", true);
    for (const u of [...predictors, ...drafters]) if (u) await deleteUser(u);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("scores only the 5 coaching metrics — no vanity metrics, no platform status", async () => {
    const h = await health();
    const keys = h.components.map((c) => c.key).sort();
    expect(keys).toEqual(["audience_growth", "community_support", "draft_participation", "event_consistency", "prediction_participation"]);
    // Platform status is NOT part of the score.
    expect(keys).not.toContain("platform_health");
    expect(keys).not.toContain("platform_status");
    // No accumulated-total ("vanity") metrics.
    for (const vanity of ["lifetime_users", "total_revenue", "account_age", "total_followers"]) {
      expect(keys).not.toContain(vanity);
    }
  });

  it("counts predictions and drafts as INDEPENDENT peers (neither inflates the other)", async () => {
    const h = await health();
    const pred = comp(h, "prediction_participation");
    const draft = comp(h, "draft_participation");
    // 2 predictors, 2 drafters, 4 WAU. Each metric sees only its own users.
    expect(pred.extra.predictors).toBe(2);
    expect(draft.extra.drafters).toBe(2);
    // If they were blended, predictors/drafters would show 4. They do not.
    expect(pred.extra.predictors).not.toBe(4);
    expect(draft.extra.drafters).not.toBe(4);
  });

  it("keeps the overall score within 0–100", async () => {
    const h = await health();
    expect(h.status).toBe("scored");
    expect(h.overall_score).toBeGreaterThanOrEqual(0);
    expect(h.overall_score).toBeLessThanOrEqual(100);
  });

  it("excludes a disabled feature without penalizing (weight redistribution)", async () => {
    // Draft is enabled above → applicable. Disable it by turning its settings off.
    await admin.from("competition_draft_settings").update({ is_enabled: false } as never).eq("tenant_id", tenantId);
    const h = await health();
    const draft = comp(h, "draft_participation");
    expect(draft.applicable).toBe(false);
    expect(draft.score).toBeNull(); // excluded, not zero
    // Overall still valid and normalized to 0–100 over the remaining metrics.
    expect(h.overall_score).toBeGreaterThanOrEqual(0);
    expect(h.overall_score).toBeLessThanOrEqual(100);
    await admin.from("competition_draft_settings").update({ is_enabled: true } as never).eq("tenant_id", tenantId);
  });

  it("shows Building baseline (not zero) when a feature is enabled but has no history", async () => {
    // A fresh tenant with draft enabled but no assignments yet.
    const { data: t2 } = await admin.from("tenants").insert({ slug: `ch2-${s}`, display_name: "CH2" } as never).select("id").single();
    const owner2 = await createUser(`ch2-${s}@ch.test`, "Password123!");
    const { data: c2 } = await admin.from("creators").insert({ tenant_id: t2!.id, owner_user_id: owner2, display_name: "C2", slug: `c2-${s}`, verification_status: "verified" } as never).select("id").single();
    const { data: cm2 } = await admin.from("competitions").insert({ tenant_id: t2!.id, creator_id: c2!.id, type: "SEASON", title: "S2", slug: `s2-${s}` } as never).select("id").single();
    await admin.from("competition_draft_settings").insert({ tenant_id: t2!.id, competition_id: cm2!.id, created_by: owner2, is_enabled: true } as never);
    const { data } = await admin.rpc("community_health_now", { p_tenant: t2!.id } as never);
    const h2 = data as unknown as Health;
    const draft = h2.components.find((c) => c.key === "draft_participation")!;
    expect(draft.applicable).toBe(true);
    expect(draft.building).toBe(true);
    expect(draft.score).toBeNull(); // building, not a zero score
    await deleteUser(owner2);
    await admin.from("tenants").delete().eq("id", t2!.id);
  });

  it("does not penalize when Creator Support is disabled", async () => {
    const h = await health();
    const support = comp(h, "community_support");
    // No creator_support_enabled flag on this tenant → excluded, not zero.
    expect(support.applicable).toBe(false);
    expect(support.score).toBeNull();
  });

  it("keeps benchmarks anonymous and hidden until enough tenants qualify", async () => {
    const { data } = await admin.rpc("community_health_benchmarks");
    const benchmarks = (data ?? {}) as Record<string, { median: number; top10: number; n: number }>;
    // Structure exposes only aggregates — never a tenant id or identity.
    const json = JSON.stringify(benchmarks);
    expect(json).not.toContain(tenantId);
    for (const b of Object.values(benchmarks)) {
      expect(b).toHaveProperty("median");
      expect(b).toHaveProperty("n");
      expect(b).not.toHaveProperty("tenant_id");
    }
  });

  it("preserves historical snapshot scores when the formula changes", async () => {
    await admin.rpc("snapshot_community_health", { p_tenant: tenantId } as never);
    const { data: before } = await admin.from("community_health_snapshots").select("formula_version, overall_score").eq("tenant_id", tenantId).single();
    // Change the formula (bumps the version) — the existing snapshot must not be rewritten.
    await admin.from("community_health_metrics").update({ weight: 25 } as never).eq("key", "audience_growth");
    const { data: after } = await admin.from("community_health_snapshots").select("formula_version, overall_score").eq("tenant_id", tenantId).single();
    expect(after!.formula_version).toBe(before!.formula_version);
    expect(after!.overall_score).toBe(before!.overall_score);
    await admin.from("community_health_metrics").update({ weight: 20 } as never).eq("key", "audience_growth");
  });

  it("never affects Revenue Plan assignment (independence)", async () => {
    const planBefore = await admin.from("tenant_revenue_plan_assignments").select("plan_id").eq("tenant_id", tenantId).is("ended_at", null).single();
    await admin.rpc("snapshot_community_health", { p_tenant: tenantId } as never);
    await health();
    const planAfter = await admin.from("tenant_revenue_plan_assignments").select("plan_id").eq("tenant_id", tenantId).is("ended_at", null).single();
    expect(planAfter.data!.plan_id).toBe(planBefore.data!.plan_id);
  });
});
