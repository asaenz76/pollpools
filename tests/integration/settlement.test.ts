// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { generateBracket, bracketToStructure } from "@/lib/domain/bracket";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const d = integrationEnvReady ? describe : describe.skip;

type RpcResult<T> = Promise<{ data: T | null; error: { message: string } | null }>;

// The generated RPC arg types mark params non-nullable; these wrappers cast so we
// can pass null (valid at runtime) while keeping a typed result.
function settleRpc(
  client: SupabaseClient<Database>,
  a: { eventId: string; resolution?: string; winner?: string | null; notes?: string | null; url?: string | null; key: string },
): RpcResult<{ graded: number; grading_version: number }> {
  return client.rpc("settle_event", {
    p_event_id: a.eventId,
    p_resolution: a.resolution ?? "settled",
    p_winning_competitor_id: a.winner ?? null,
    p_notes: a.notes ?? null,
    p_result_url: a.url ?? null,
    p_idempotency_key: a.key,
  } as never) as unknown as RpcResult<{ graded: number; grading_version: number }>;
}
function regradeRpc(
  client: SupabaseClient<Database>,
  a: { eventId: string; winner?: string | null; reason: string; key: string },
): RpcResult<{ graded: number }> {
  return client.rpc("regrade_event", {
    p_event_id: a.eventId,
    p_resolution: "settled",
    p_winning_competitor_id: a.winner ?? null,
    p_reason: a.reason,
    p_idempotency_key: a.key,
  } as never) as unknown as RpcResult<{ graded: number }>;
}

d("settlement engine", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let owner: SupabaseClient<Database>;
  let u1: string, u2: string, u3: string;
  let g1: string, g2: string; // dedicated to the grader-path test (isolated stats)
  let keyN = 0;
  const key = () => `set-${s}-${keyN++}-abcdefgh`;

  async function makeEvent(startsOffsetMs = -3_600_000, competitionId: string | null = null) {
    const suf = uniqueSuffix();
    const { data: comps } = await admin
      .from("competitors")
      .insert([
        { tenant_id: tenantId, creator_id: creatorId, name: `A ${suf}`, slug: `a-${suf}` },
        { tenant_id: tenantId, creator_id: creatorId, name: `B ${suf}`, slug: `b-${suf}` },
      ])
      .select("id");
    const compA = comps![0]!.id, compB = comps![1]!.id;
    const { data: ev } = await admin
      .from("events")
      .insert({ tenant_id: tenantId, competition_id: competitionId, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() + startsOffsetMs).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() })
      .select("id")
      .single();
    const { data: mkt } = await admin
      .from("markets")
      .insert({ tenant_id: tenantId, event_id: ev!.id, question: "Which wins?", status: "open" })
      .select("id")
      .single();
    const { data: opts } = await admin
      .from("market_options")
      .insert([
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compA, label: "A", display_order: 0 },
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compB, label: "B", display_order: 1 },
      ])
      .select("id, competitor_id");
    const optA = opts!.find((o) => o.competitor_id === compA)!.id;
    const optB = opts!.find((o) => o.competitor_id === compB)!.id;
    return { eventId: ev!.id, marketId: mkt!.id, compA, compB, optA, optB };
  }

  // Settle grading against an explicit winning-OPTION set (as a MarketGrader
  // resolves), the strategy-based path used by submitResultAction.
  function settleByOptionsRpc(
    a: { eventId: string; winner: string; optionIds: string[]; key: string },
  ): RpcResult<{ graded: number }> {
    return admin.rpc("settle_event", {
      p_event_id: a.eventId,
      p_resolution: "settled",
      p_winning_competitor_id: a.winner,
      p_notes: null,
      p_result_url: null,
      p_idempotency_key: a.key,
      p_winning_option_ids: a.optionIds,
    } as never) as unknown as RpcResult<{ graded: number }>;
  }

  const predict = (marketId: string, userId: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: userId, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${uniqueSuffix()}`, status: "active" });

  const statsOf = async (userId: string) =>
    (await admin.from("user_statistics").select("*").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle()).data;

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `set-${s}`, display_name: "Settle" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId });
    await admin.from("achievements").insert([
      { tenant_id: tenantId, key: "first_call", name: "First Call", rule: { type: "first_prediction" } },
      { tenant_id: tenantId, key: "bullseye", name: "Bullseye", rule: { type: "first_correct" } },
      { tenant_id: tenantId, key: "on_fire", name: "On Fire", rule: { type: "streak", threshold: 5 } },
    ]);
    ownerId = await createUser(`owner-${s}@example.test`, pw);
    const { data: c } = await admin
      .from("creators")
      .insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" })
      .select("id")
      .single();
    creatorId = c!.id;
    u1 = await createUser(`u1-${s}@example.test`, pw);
    u2 = await createUser(`u2-${s}@example.test`, pw);
    u3 = await createUser(`u3-${s}@example.test`, pw);
    g1 = await createUser(`g1-${s}@example.test`, pw);
    g2 = await createUser(`g2-${s}@example.test`, pw);
    for (const uid of [ownerId, u1, u2, u3, g1, g2]) {
      await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uid, role: "member" });
    }
    owner = await signInAs(`owner-${s}@example.test`, pw);
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, u1, u2, u3, g1, g2]) if (id) await deleteUser(id);
  });

  it("takes scoring points from the configured rule, not a hard-coded 1 (F-04)", async () => {
    // A competition-scoped scoring rule: a correct pick is worth 3 points.
    const { data: rule } = await admin
      .from("scoring_rules")
      .insert({ tenant_id: tenantId, key: `triple-${uniqueSuffix()}`, name: "Triple", config: { correct: 3, incorrect: 0, void: 0 }, is_default: false })
      .select("id").single();
    const { data: comp } = await admin
      .from("competitions")
      .insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "SC", slug: `sc-${uniqueSuffix()}`, status: "active", scoring_rule_id: rule!.id })
      .select("id").single();

    const e = await makeEvent(-3_600_000, comp!.id);
    await predict(e.marketId, g1, e.optA);
    await predict(e.marketId, g2, e.optB);
    const { error } = await settleByOptionsRpc({ eventId: e.eventId, winner: e.compA, optionIds: [e.optA], key: key() });
    expect(error).toBeNull();

    const { data: grades } = await admin.from("settlement_grades").select("user_id, outcome, points").eq("event_id", e.eventId);
    expect(grades!.find((g) => g.user_id === g1)).toMatchObject({ outcome: "correct", points: 3 });
    expect(grades!.find((g) => g.user_id === g2)).toMatchObject({ outcome: "incorrect", points: 0 });
  });

  it("grades against a grader-resolved winning-option set (strategy path)", async () => {
    const e = await makeEvent();
    await predict(e.marketId, g1, e.optA);
    await predict(e.marketId, g2, e.optB);

    const { data, error } = await settleByOptionsRpc({ eventId: e.eventId, winner: e.compA, optionIds: [e.optA], key: key() });
    expect(error).toBeNull();
    expect(data!.graded).toBe(2);

    const { data: opts } = await admin.from("market_options").select("id, status").eq("market_id", e.marketId);
    expect(opts!.find((o) => o.id === e.optA)!.status).toBe("winner");
    expect(opts!.find((o) => o.id === e.optB)!.status).toBe("loser");
    const { data: grades } = await admin.from("settlement_grades").select("user_id, outcome, points").eq("event_id", e.eventId);
    expect(grades!.find((g) => g.user_id === g1)!.outcome).toBe("correct");
    expect(grades!.find((g) => g.user_id === g2)!.outcome).toBe("incorrect");
  });

  it("grades predictions, marks the winning option, and updates statistics", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u1, e.optA);
    await predict(e.marketId, u2, e.optA);
    await predict(e.marketId, u3, e.optB);

    const { data, error } = await settleRpc(admin, { eventId: e.eventId, winner: e.compA, key: key() });
    expect(error).toBeNull();
    expect(data!.graded).toBe(3);

    const { data: opts } = await admin.from("market_options").select("id, status").eq("market_id", e.marketId);
    expect(opts!.find((o) => o.id === e.optA)!.status).toBe("winner");
    expect(opts!.find((o) => o.id === e.optB)!.status).toBe("loser");

    expect((await statsOf(u1))!.total_points).toBe(1);
    expect((await statsOf(u1))!.current_streak).toBe(1);
    expect((await statsOf(u3))!.total_points).toBe(0);
    expect((await statsOf(u3))!.current_streak).toBe(0);
    expect((await statsOf(u3))!.total_predictions).toBe(1);

    expect((await admin.from("events").select("status").eq("id", e.eventId).single()).data!.status).toBe("settled");
  });

  it("is idempotent on retry and blocks a second settle", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u1, e.optA);
    const k = key();
    const first = await settleRpc(admin, { eventId: e.eventId, winner: e.compA, key: k });
    const retry = await settleRpc(admin, { eventId: e.eventId, winner: e.compA, key: k });
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);
    const { count } = await admin.from("settlements").select("*", { count: "exact", head: true }).eq("event_id", e.eventId);
    expect(count).toBe(1);
    const again = await settleRpc(admin, { eventId: e.eventId, winner: e.compA, key: key() });
    expect(again.error?.message).toContain("ALREADY_SETTLED");
  });

  it("regrade recomputes statistics and streaks correctly (reversible)", async () => {
    const us = await createUser(`streak-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: us, role: "member" });
    const su = async () => (await admin.from("user_statistics").select("*").eq("tenant_id", tenantId).eq("user_id", us).maybeSingle()).data;

    const e1 = await makeEvent(-7_200_000);
    const e2 = await makeEvent(-3_600_000);
    await predict(e1.marketId, us, e1.optA);
    await predict(e2.marketId, us, e2.optA);
    await settleRpc(admin, { eventId: e1.eventId, winner: e1.compA, key: key() });
    await settleRpc(admin, { eventId: e2.eventId, winner: e2.compA, key: key() });
    expect((await su())!.current_streak).toBe(2);
    const pointsBefore = (await su())!.total_points;

    const rg = await regradeRpc(admin, { eventId: e2.eventId, winner: e2.compB, reason: "corrected", key: key() });
    expect(rg.error).toBeNull();
    expect((await su())!.current_streak).toBe(0);
    expect((await su())!.total_points).toBe(pointsBefore - 1);

    const { data: settlements } = await admin.from("settlements").select("status").eq("event_id", e2.eventId);
    expect(settlements!.filter((x) => x.status === "active")).toHaveLength(1);
    expect(settlements!.filter((x) => x.status === "superseded")).toHaveLength(1);

    await regradeRpc(admin, { eventId: e2.eventId, winner: e2.compA, reason: "re-corrected", key: key() });
    expect((await su())!.current_streak).toBe(2);

    await deleteUser(us);
  });

  it("grants achievements once (idempotent)", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u2, e.optA);
    await settleRpc(admin, { eventId: e.eventId, winner: e.compA, key: key() });
    const before = await admin.from("user_achievements").select("achievement_id").eq("tenant_id", tenantId).eq("user_id", u2);
    expect(before.data!.length).toBeGreaterThanOrEqual(2);

    await regradeRpc(admin, { eventId: e.eventId, winner: e.compA, reason: "no-op", key: key() });
    const after = await admin.from("user_achievements").select("achievement_id").eq("tenant_id", tenantId).eq("user_id", u2);
    expect(after.data!.length).toBe(before.data!.length);
  });

  it("void resolution grades as void with no points or streak effect", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u3, e.optA);
    const before = (await statsOf(u3))!.total_points;
    await settleRpc(admin, { eventId: e.eventId, resolution: "voided", winner: null, key: key() });
    const { data: grades } = await admin.from("settlement_grades").select("outcome").eq("event_id", e.eventId);
    expect(grades!.every((g) => g.outcome === "void")).toBe(true);
    expect((await statsOf(u3))!.total_points).toBe(before);
  });

  it("populates the global leaderboard", async () => {
    const { data: lb } = await admin.from("leaderboard_snapshots").select("user_id, total_points, rank, ranked").eq("tenant_id", tenantId).eq("scope", "global");
    expect(lb!.length).toBeGreaterThan(0);
  });

  it("fires bracket advancement on settle", async () => {
    const suf = uniqueSuffix();
    const { data: comps } = await admin
      .from("competitors")
      .insert(Array.from({ length: 4 }, (_, i) => ({ tenant_id: tenantId, creator_id: creatorId, name: `K${i}-${suf}`, slug: `k${i}-${suf}` })))
      .select("id");
    const ids = comps!.map((c) => c.id);
    const { data: comp } = await admin
      .from("competitions")
      .insert({ tenant_id: tenantId, creator_id: creatorId, type: "BRACKET", title: "KO", slug: `ko-${suf}`, status: "active" })
      .select("id")
      .single();
    await owner.rpc("create_bracket", { p_competition_id: comp!.id, p_structure: bracketToStructure(generateBracket(ids)) });

    const { data: sf0 } = await admin.from("bracket_slots").select("event_id, competitor_a_id").eq("competition_id", comp!.id).eq("match_index", 0).single();
    await settleRpc(admin, { eventId: sf0!.event_id!, winner: sf0!.competitor_a_id!, key: key() });

    const { data: fin } = await admin.from("bracket_slots").select("competitor_a_id, competitor_b_id").eq("competition_id", comp!.id).eq("match_index", 2).single();
    expect([fin!.competitor_a_id, fin!.competitor_b_id]).toContain(sf0!.competitor_a_id);
  });

  it("authorization: creator without permission is rejected; with the grant, allowed", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u1, e.optA);
    const denied = await settleRpc(owner, { eventId: e.eventId, winner: e.compA, key: key() });
    expect(denied.error?.message).toContain("NOT_AUTHORIZED");

    await admin.from("creators").update({ settlement_enabled: true }).eq("id", creatorId);
    const allowed = await settleRpc(owner, { eventId: e.eventId, winner: e.compA, key: key() });
    expect(allowed.error).toBeNull();
    await admin.from("creators").update({ settlement_enabled: false }).eq("id", creatorId);
  });
});
