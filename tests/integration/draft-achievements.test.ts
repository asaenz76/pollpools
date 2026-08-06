// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Draft standings + achievements refinement (§5E, F-15). Finishing positions are
 * authoritative per-version result data; a regrade that only changes the winning
 * interpretation preserves a recorded finishing order, while a corrected order is
 * recorded anew. Draft scoring stays config-driven and separate from prediction
 * scoring. Achievements are version-aware, prerequisite-gated, and revoke only
 * reversible milestones.
 */
d("draft standings & achievements", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  const users: string[] = [];
  let keyN = 0;
  const key = () => `da-${s}-${keyN++}-abcdefgh`;

  async function newUser() {
    const id = await createUser(`da-${uniqueSuffix()}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: id, role: "member" });
    users.push(id);
    return id;
  }
  async function makeDraftComp(opts: { fallback?: boolean } = {}) {
    const suf = uniqueSuffix();
    const { data: comp } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "D", slug: `d-${suf}`, status: "active" }).select("id").single();
    await admin.from("competition_draft_settings").insert({ tenant_id: tenantId, competition_id: comp!.id, is_enabled: true, mode: "exclusive", access_type: "free", status: "open", winner_only_fallback: opts.fallback ?? true, created_by: ownerId } as never);
    await admin.from("draft_scoring_rules").insert({ tenant_id: tenantId, competition_id: comp!.id, scoring_type: "competition_points", config: { position_points: { "1": 10, "2": 8, "3": 6 } } } as never);
    return comp!.id;
  }
  async function makeCompetitors(n: number) {
    const suf = uniqueSuffix();
    const rows = Array.from({ length: n }, (_, i) => ({ tenant_id: tenantId, creator_id: creatorId, name: `C${i}-${suf}`, slug: `c${i}-${suf}` }));
    const { data } = await admin.from("competitors").insert(rows).select("id");
    return data!.map((c) => c.id);
  }
  async function makeEvent(competitionId: string, competitorIds: string[]) {
    const suf = uniqueSuffix();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, competition_id: competitionId, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() }).select("id").single();
    for (const cid of competitorIds) await admin.from("event_competitors").insert({ tenant_id: tenantId, event_id: ev!.id, competitor_id: cid } as never);
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    await admin.from("market_options").insert(competitorIds.map((cid, i) => ({ tenant_id: tenantId, market_id: mkt!.id, competitor_id: cid, label: `O${i}`, display_order: i })));
    return ev!.id;
  }
  async function assign(competitionId: string, user: string, competitorId: string) {
    await admin.from("competitor_draft_assignments").insert({ tenant_id: tenantId, competition_id: competitionId, competitor_id: competitorId, user_id: user, status: "confirmed", assignment_source: "user_selected", payment_status: "not_required", exclusive_slot: true, reserved_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), idempotency_key: `asg-${uniqueSuffix()}` } as never);
  }
  const settle = (eventId: string, winner: string) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const regrade = (eventId: string, winner: string) =>
    admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_reason: "corr", p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const recordPositions = (eventId: string, positions: { competitor_id: string; position: number }[]) =>
    admin.rpc("record_event_positions", { p_event_id: eventId, p_positions: positions } as never);
  const drain = () => drainJobs(admin, tenantId);
  const standings = async (competitionId: string) =>
    (await admin.from("draft_leaderboard_snapshots").select("user_id, competition_points, rank").eq("competition_id", competitionId)).data ?? [];
  const pointsFor = async (competitionId: string, user: string) =>
    (await standings(competitionId)).find((r) => r.user_id === user)?.competition_points ?? null;
  const activeSettlement = async (eventId: string) =>
    (await admin.from("settlements").select("id, grading_version").eq("event_id", eventId).eq("status", "active").single()).data!;
  const versionResults = async (eventId: string, version: number) =>
    (await admin.from("event_competitor_results").select("competitor_id, finishing_position, points, recorded").eq("event_id", eventId).eq("grading_version", version)).data ?? [];

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `da-${s}`, display_name: "DA" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    await admin.from("achievements").insert([
      { tenant_id: tenantId, key: "first_correct", name: "Bullseye", rule: { type: "first_correct" } },
      { tenant_id: tenantId, key: "on_fire", name: "On Fire", rule: { type: "streak", threshold: 2 } },
    ]);
    ownerId = await createUser(`daowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, ...users]) if (id) await deleteUser(id);
  });

  it("updates draft standings after settlement (winner-only baseline)", async () => {
    const comp = await makeDraftComp();
    const [A, B] = await makeCompetitors(2);
    const u1 = await newUser(), u2 = await newUser();
    await assign(comp, u1, A!); await assign(comp, u2, B!);
    const e = await makeEvent(comp, [A!, B!]);
    await settle(e, A!); // A wins → baseline A=1 (10 pts), B absent (0)
    await drain();
    expect(await pointsFor(comp, u1)).toBe(10);
    expect(await pointsFor(comp, u2)).toBe(0);
  });

  it("applies the configured finishing-position scoring and updates only the affected competition", async () => {
    const comp = await makeDraftComp();
    const other = await makeDraftComp();
    const [A, B, C] = await makeCompetitors(3);
    const u1 = await newUser(), u2 = await newUser(), u3 = await newUser();
    await assign(comp, u1, A!); await assign(comp, u2, B!); await assign(comp, u3, C!);
    const e = await makeEvent(comp, [A!, B!, C!]);
    await settle(e, A!);
    await recordPositions(e, [{ competitor_id: A!, position: 1 }, { competitor_id: B!, position: 2 }, { competitor_id: C!, position: 3 }]);
    await drain();
    expect(await pointsFor(comp, u1)).toBe(10);
    expect(await pointsFor(comp, u2)).toBe(8);
    expect(await pointsFor(comp, u3)).toBe(6);
    expect(await standings(other)).toHaveLength(0); // unrelated competition untouched
  });

  it("blocks the draft projection when positions are missing and the winner-only fallback is disabled", async () => {
    const comp = await makeDraftComp({ fallback: false });
    const [A, B] = await makeCompetitors(2);
    const u1 = await newUser();
    await assign(comp, u1, A!);
    const e = await makeEvent(comp, [A!, B!]);
    await settle(e, A!);
    const v = await activeSettlement(e);
    const res = await admin.rpc("project_draft_standings", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_settlement_id: v.id } as never);
    expect(res.data).toBe("blocked"); // never silently invents a degraded result
  });

  it("stale-version draft job no-ops; duplicate execution is harmless", async () => {
    const comp = await makeDraftComp();
    const [A, B] = await makeCompetitors(2);
    const u1 = await newUser();
    await assign(comp, u1, A!);
    const e = await makeEvent(comp, [A!, B!]);
    await settle(e, A!);
    const v1 = await activeSettlement(e);
    await regrade(e, B!);
    const v2 = await activeSettlement(e);
    const call = (v: { id: string; grading_version: number }) =>
      admin.rpc("project_draft_standings", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_settlement_id: v.id } as never);
    expect((await call(v1)).data).toBe("stale");
    expect((await call(v2)).data).toBe("applied");
    expect((await call(v2)).data).toBe("applied"); // duplicate idempotent
  });

  it("preserves a recorded finishing order across a winner-only regrade; historical rows retained", async () => {
    const comp = await makeDraftComp();
    const [A, B] = await makeCompetitors(2);
    const u1 = await newUser(), u2 = await newUser();
    await assign(comp, u1, A!); await assign(comp, u2, B!);
    const e = await makeEvent(comp, [A!, B!]);
    await settle(e, A!);
    await recordPositions(e, [{ competitor_id: A!, position: 1 }, { competitor_id: B!, position: 2 }]);
    await drain();
    const v1 = await activeSettlement(e);
    expect(await pointsFor(comp, u1)).toBe(10);
    expect(await pointsFor(comp, u2)).toBe(8);

    // Regrade the prediction winner to B; the recorded finishing order is unchanged
    // and must carry forward (A still 1st for draft purposes).
    await regrade(e, B!);
    await drain();
    const v2 = await activeSettlement(e);
    expect(await pointsFor(comp, u1)).toBe(10); // A still 1st
    expect(await pointsFor(comp, u2)).toBe(8);

    // The carried-forward v2 rows and the historical v1 rows both exist and are recorded.
    expect((await versionResults(e, v1.grading_version)).every((r) => r.recorded)).toBe(true);
    expect((await versionResults(e, v2.grading_version)).find((r) => r.competitor_id === A)!.finishing_position).toBe(1);
  });

  it("replaces the finishing order when a corrected order is recorded for the new version", async () => {
    const comp = await makeDraftComp();
    const [A, B] = await makeCompetitors(2);
    const u1 = await newUser(), u2 = await newUser();
    await assign(comp, u1, A!); await assign(comp, u2, B!);
    const e = await makeEvent(comp, [A!, B!]);
    await settle(e, A!);
    await recordPositions(e, [{ competitor_id: A!, position: 1 }, { competitor_id: B!, position: 2 }]);
    await drain();
    await regrade(e, B!);
    await drain();
    // The finishing order actually changed → record the corrected order for the new version.
    await recordPositions(e, [{ competitor_id: B!, position: 1 }, { competitor_id: A!, position: 2 }]);
    await drain();
    expect(await pointsFor(comp, u2)).toBe(10); // B now 1st
    expect(await pointsFor(comp, u1)).toBe(8);
  });

  it("incremental draft standings equal a deterministic rebuild", async () => {
    const comp = await makeDraftComp();
    const [A, B] = await makeCompetitors(2);
    const u1 = await newUser(), u2 = await newUser();
    await assign(comp, u1, A!); await assign(comp, u2, B!);
    const e = await makeEvent(comp, [A!, B!]);
    await settle(e, A!);
    await recordPositions(e, [{ competitor_id: A!, position: 1 }, { competitor_id: B!, position: 2 }]);
    await drain();
    const before = (await standings(comp)).map((r) => ({ ...r })).sort((a, b) => a.user_id.localeCompare(b.user_id));
    await admin.from("draft_leaderboard_snapshots").delete().eq("competition_id", comp);
    const rb = await admin.rpc("rebuild_draft_competition", { p_tenant: tenantId, p_competition: comp } as never);
    expect(rb.error).toBeNull();
    const after = (await standings(comp)).map((r) => ({ ...r })).sort((a, b) => a.user_id.localeCompare(b.user_id));
    expect(after).toEqual(before);
  });

  // ── Achievements ────────────────────────────────────────────────────────────
  const achievementsOf = async (user: string) =>
    (await admin.from("user_achievements").select("achievement_id, revoked_at, achievements(key)").eq("tenant_id", tenantId).eq("user_id", user)).data ?? [];
  const hasActive = async (user: string, k: string) =>
    (await achievementsOf(user)).some((a) => (a.achievements as unknown as { key: string }).key === k && a.revoked_at === null);

  it("grants an achievement once and duplicate/again jobs are harmless", async () => {
    const u = await newUser();
    const [A, B] = await makeCompetitors(2);
    const comp = await makeDraftComp();
    const e = await makeEvent(comp, [A!, B!]);
    const { data: opts } = await admin.from("market_options").select("id, competitor_id, market_id").eq("market_id", (await admin.from("markets").select("id").eq("event_id", e).single()).data!.id);
    const optA = opts!.find((o) => o.competitor_id === A)!;
    await admin.from("predictions").insert({ tenant_id: tenantId, market_id: optA.market_id, user_id: u, option_id: optA.id, original_option_id: optA.id, idempotency_key: `p-${uniqueSuffix()}`, status: "active" } as never);
    await settle(e, A!);
    await drain();
    expect(await hasActive(u, "first_correct")).toBe(true);
    const before = (await achievementsOf(u)).length;
    // Re-run achievements projection (idempotent) → no duplicate row.
    const v = await activeSettlement(e);
    await admin.rpc("project_achievements", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_user: u, p_settlement_id: v.id } as never);
    expect((await achievementsOf(u)).length).toBe(before);
  });

  it("achievement projection waits for the user's statistics (defer), then applies", async () => {
    const u = await newUser();
    const [A, B] = await makeCompetitors(2);
    const comp = await makeDraftComp();
    const e = await makeEvent(comp, [A!, B!]);
    const { data: opts } = await admin.from("market_options").select("id, competitor_id, market_id").eq("market_id", (await admin.from("markets").select("id").eq("event_id", e).single()).data!.id);
    const optA = opts!.find((o) => o.competitor_id === A)!;
    await admin.from("predictions").insert({ tenant_id: tenantId, market_id: optA.market_id, user_id: u, option_id: optA.id, original_option_id: optA.id, idempotency_key: `p-${uniqueSuffix()}`, status: "active" } as never);
    await settle(e, A!); // jobs enqueued, NOT drained
    const v = await activeSettlement(e);
    const callAch = () => admin.rpc("project_achievements", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_user: u, p_settlement_id: v.id } as never);
    expect((await callAch()).data).toBe("defer"); // the user's stats job is still pending
    await admin.rpc("rebuild_user_statistics", { p_tenant: tenantId, p_user: u } as never);
    await admin.from("system_jobs").update({ status: "succeeded" }).eq("job_type", "projection.user_stats").filter("payload->>settlement_id", "eq", v.id).filter("payload->>user_id", "eq", u);
    expect((await callAch()).data).toBe("applied");
    expect(await hasActive(u, "first_correct")).toBe(true);
  });

  it("revokes a reversible achievement on regrade but preserves a historical milestone", async () => {
    const u = await newUser();
    const [A, B] = await makeCompetitors(2);
    const comp = await makeDraftComp();
    // Two correct predictions in a row → streak 2 → on_fire (reversible) + first_correct (historical).
    const mk = async (startsAtMs: number) => {
      const e = await makeEvent(comp, [A!, B!]);
      await admin.from("events").update({ starts_at: new Date(startsAtMs).toISOString() }).eq("id", e);
      const { data: opts } = await admin.from("market_options").select("id, competitor_id, market_id").eq("market_id", (await admin.from("markets").select("id").eq("event_id", e).single()).data!.id);
      const optA = opts!.find((o) => o.competitor_id === A)!;
      await admin.from("predictions").insert({ tenant_id: tenantId, market_id: optA.market_id, user_id: u, option_id: optA.id, original_option_id: optA.id, idempotency_key: `p-${uniqueSuffix()}`, status: "active" } as never);
      return e;
    };
    const e1 = await mk(Date.now() - 5_000_000);
    const e2 = await mk(Date.now() - 4_000_000);
    await settle(e1, A!); await settle(e2, A!); await drain();
    expect(await hasActive(u, "on_fire")).toBe(true);      // streak 2
    expect(await hasActive(u, "first_correct")).toBe(true);

    // Regrade e2 to break the streak (best_streak drops to 1).
    await regrade(e2, B!); await drain();
    expect(await hasActive(u, "on_fire")).toBe(false);     // reversible → revoked
    // The revoked row is preserved (audit), not deleted.
    expect((await achievementsOf(u)).some((a) => (a.achievements as unknown as { key: string }).key === "on_fire")).toBe(true);
    expect(await hasActive(u, "first_correct")).toBe(true); // historical → preserved
  });

  it("isolates draft standings and achievements across tenants", async () => {
    const { data: t2 } = await admin.from("tenants").insert({ slug: `da2-${s}`, display_name: "DA2" }).select("id").single();
    try {
      const rows = (await admin.from("draft_leaderboard_snapshots").select("id").eq("tenant_id", t2!.id)).data ?? [];
      expect(rows).toHaveLength(0);
    } finally {
      await admin.from("tenants").delete().eq("id", t2!.id);
    }
  });
});
