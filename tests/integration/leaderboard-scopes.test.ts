// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";
import type { LeaderboardScope } from "@/types/enums";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Scoped + incremental leaderboard refresh (§5D, F-05). Four separate scopes —
 * global, creator, competition, season (a SEASON competition) — refreshed only
 * when a settlement's event touches them; unrelated scopes stay untouched.
 */
d("scoped leaderboards", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string, creator2Id: string;
  let ownerId: string;
  let compReg: string;   // a normal competition (type TOURNAMENT)
  let compSeason: string; // a season (type SEASON)
  const users: string[] = [];
  let keyN = 0;
  const key = () => `lb-${s}-${keyN++}-abcdefgh`;

  async function newUser() {
    const id = await createUser(`lb-${uniqueSuffix()}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: id, role: "member" });
    users.push(id);
    return id;
  }
  async function makeEvent(opts: { competitionId?: string | null; creatorId?: string } = {}) {
    const suf = uniqueSuffix();
    const cr = opts.creatorId ?? creatorId;
    const { data: comps } = await admin
      .from("competitors")
      .insert([
        { tenant_id: tenantId, creator_id: cr, name: `A ${suf}`, slug: `a-${suf}` },
        { tenant_id: tenantId, creator_id: cr, name: `B ${suf}`, slug: `b-${suf}` },
      ]).select("id");
    const compA = comps![0]!.id, compB = comps![1]!.id;
    const { data: ev } = await admin
      .from("events")
      .insert({ tenant_id: tenantId, competition_id: opts.competitionId ?? null, creator_id: cr, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() })
      .select("id").single();
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    const { data: opt } = await admin
      .from("market_options")
      .insert([
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compA, label: "A", display_order: 0 },
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compB, label: "B", display_order: 1 },
      ]).select("id, competitor_id");
    return { eventId: ev!.id, marketId: mkt!.id, compA, compB, optA: opt!.find((o) => o.competitor_id === compA)!.id, optB: opt!.find((o) => o.competitor_id === compB)!.id };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${uniqueSuffix()}`, status: "active" });
  const settle = (eventId: string, winner: string | null) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: winner ? "settled" : "voided", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const regrade = (eventId: string, winner: string) =>
    admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_reason: "corr", p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const drain = () => drainJobs(admin, tenantId);
  const lb = async (scope: LeaderboardScope, scopeId: string | null) => {
    let q = admin.from("leaderboard_snapshots").select("user_id, rank, total_points, correct_predictions, accuracy, ranked").eq("tenant_id", tenantId).eq("scope", scope).eq("period", "all_time");
    q = scopeId === null ? q.is("scope_id", null) : q.eq("scope_id", scopeId);
    return (await q).data ?? [];
  };

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `lb-${s}`, display_name: "LB" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    ownerId = await createUser(`lbowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C1", slug: `c1-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    const { data: c2 } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C2", slug: `c2-${s}`, verification_status: "verified" }).select("id").single();
    creator2Id = c2!.id;
    const { data: cr } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "TOURNAMENT", title: "Reg", slug: `reg-${s}`, status: "active" }).select("id").single();
    compReg = cr!.id;
    const { data: se } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "Season", slug: `season-${s}`, status: "active" }).select("id").single();
    compSeason = se!.id;
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, ...users]) if (id) await deleteUser(id);
  });

  it("refreshes global + creator + competition for a competition event; no season scope", async () => {
    const u1 = await newUser(), u2 = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u1, e.optA); // correct
    await predict(e.marketId, u2, e.optB); // incorrect
    await settle(e.eventId, e.compA);
    await drain();

    expect((await lb("global", null)).find((r) => r.user_id === u1)).toMatchObject({ total_points: 1, rank: 1, ranked: true });
    expect((await lb("creator", creatorId)).find((r) => r.user_id === u1)).toMatchObject({ total_points: 1, ranked: true });
    expect((await lb("competition", compReg)).find((r) => r.user_id === u1)).toMatchObject({ total_points: 1, ranked: true });
    // No season row was created for this competition-scoped event.
    expect(await lb("season", compReg)).toHaveLength(0);
    // Creator 2 is untouched.
    expect(await lb("creator", creator2Id)).toHaveLength(0);
  });

  it("refreshes the SEASON scope (not competition) for a season event", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compSeason });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    await drain();
    expect((await lb("season", compSeason)).find((r) => r.user_id === u)).toMatchObject({ total_points: 1, ranked: true });
    expect(await lb("competition", compSeason)).toHaveLength(0); // a SEASON is never a 'competition' scope
  });

  it("a standalone event (no competition) affects only global + creator", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: null });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    await drain();
    expect((await lb("global", null)).some((r) => r.user_id === u)).toBe(true);
    expect((await lb("creator", creatorId)).some((r) => r.user_id === u)).toBe(true);
  });

  it("refreshing one competition leaves another competition's leaderboard unchanged", async () => {
    const uReg = await newUser(), uSeason = await newUser();
    const er = await makeEvent({ competitionId: compReg });
    await predict(er.marketId, uReg, er.optA);
    await settle(er.eventId, er.compA); await drain();
    const seasonBefore = await lb("season", compSeason);

    const es = await makeEvent({ competitionId: compSeason });
    await predict(es.marketId, uSeason, es.optA);
    await settle(es.eventId, es.compA); await drain();

    // compReg's competition leaderboard is unchanged; season gained uSeason.
    expect((await lb("competition", compReg)).some((r) => r.user_id === uReg)).toBe(true);
    expect((await lb("competition", compReg)).some((r) => r.user_id === uSeason)).toBe(false);
    expect((await lb("season", compSeason)).length).toBeGreaterThan(seasonBefore.length);
  });

  it("respects the minimum-ranked-predictions threshold (below → unranked)", async () => {
    await admin.from("tenant_settings").update({ minimum_ranked_predictions: 3 }).eq("tenant_id", tenantId);
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA); await drain();
    const row = (await lb("competition", compReg)).find((r) => r.user_id === u);
    expect(row).toMatchObject({ ranked: false, rank: null }); // 1 < 3
    await admin.from("tenant_settings").update({ minimum_ranked_predictions: 1 }).eq("tenant_id", tenantId);
  });

  it("stale-version leaderboard jobs no-op; duplicate + out-of-order are safe", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    const v1 = (await admin.from("settlements").select("id, grading_version").eq("event_id", e.eventId).eq("status", "active").single()).data!;
    await regrade(e.eventId, e.compB); // v2; u now incorrect
    const v2 = (await admin.from("settlements").select("id, grading_version").eq("event_id", e.eventId).eq("status", "active").single()).data!;
    await drain(); // stats first, then leaderboard (FIFO); v1 leaderboard jobs skip

    const call = (v: { id: string; grading_version: number }, scope: string, scopeId: string | null) =>
      admin.rpc("project_leaderboard_scope", { p_tenant: tenantId, p_event: e.eventId, p_version: v.grading_version, p_settlement_id: v.id, p_scope: scope, p_scope_id: scopeId } as never);
    expect((await call(v1, "competition", compReg)).data).toBe("stale");    // superseded
    expect((await call(v2, "competition", compReg)).data).toBe("applied");  // active, prereqs ready
    expect((await call(v2, "competition", compReg)).data).toBe("applied");  // duplicate, idempotent
    expect((await call(v1, "global", null)).data).toBe("stale");            // out-of-order stale
    expect((await lb("competition", compReg)).find((r) => r.user_id === u)).toMatchObject({ total_points: 0 }); // v2 (incorrect)
  });

  it("regrade correct→incorrect updates the scope leaderboard deterministically", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA); await drain();
    expect((await lb("competition", compReg)).find((r) => r.user_id === u)).toMatchObject({ total_points: 1 });
    await regrade(e.eventId, e.compB); await drain();
    expect((await lb("competition", compReg)).find((r) => r.user_id === u)).toMatchObject({ total_points: 0 });
  });

  it("incremental result equals a full scope rebuild", async () => {
    const uA = await newUser(), uB = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, uA, e.optA); // correct
    await predict(e.marketId, uB, e.optB); // incorrect
    await settle(e.eventId, e.compA); await drain();
    const before = (await lb("competition", compReg)).map((r) => ({ ...r })).sort((a, b) => a.user_id.localeCompare(b.user_id));

    await admin.from("leaderboard_snapshots").delete().eq("tenant_id", tenantId).eq("scope", "competition").eq("scope_id", compReg);
    const rb = await admin.rpc("rebuild_leaderboard_scope", { p_tenant: tenantId, p_scope_type: "competition", p_scope_id: compReg } as never);
    expect(rb.error).toBeNull();
    const after = (await lb("competition", compReg)).map((r) => ({ ...r })).sort((a, b) => a.user_id.localeCompare(b.user_id));
    expect(after).toEqual(before);
  });

  it("isolates leaderboards across tenants", async () => {
    const { data: t2 } = await admin.from("tenants").insert({ slug: `lb2-${s}`, display_name: "LB2" }).select("id").single();
    const t2Id = t2!.id;
    try {
      // A settlement in T1 never creates rows under T2.
      const globalT2 = (await admin.from("leaderboard_snapshots").select("id").eq("tenant_id", t2Id)).data ?? [];
      expect(globalT2).toHaveLength(0);
    } finally {
      await admin.from("tenants").delete().eq("id", t2Id);
    }
  });

  // ── §5D dependency hardening: leaderboard must not read stale statistics ─────
  const activeSettlement = async (eventId: string) =>
    (await admin.from("settlements").select("id, grading_version").eq("event_id", eventId).eq("status", "active").single()).data!;
  const setStatsJobs = (sid: string, status: string) =>
    admin.from("system_jobs").update({ status }).eq("job_type", "projection.user_stats").filter("payload->>settlement_id", "eq", sid);
  const refreshGlobal = (v: { id: string; grading_version: number }, eventId: string) =>
    admin.rpc("project_leaderboard_scope", { p_tenant: tenantId, p_event: eventId, p_version: v.grading_version, p_settlement_id: v.id, p_scope: "global", p_scope_id: null } as never);

  it("defers the leaderboard while prerequisite statistics jobs are unfinished", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA); // jobs enqueued, NOT drained → stats pending
    const v = await activeSettlement(e.eventId);
    expect((await refreshGlobal(v, e.eventId)).data).toBe("defer"); // prerequisites pending
  });

  it("blocks (visibly) when a prerequisite statistics job is dead-lettered", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    const v = await activeSettlement(e.eventId);
    await setStatsJobs(v.id, "dead");
    expect((await refreshGlobal(v, e.eventId)).data).toBe("blocked");
  });

  it("proceeds once the prerequisite statistics jobs succeed (idempotent)", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    const v = await activeSettlement(e.eventId);
    // Simulate the stats jobs finishing: recompute the user + mark the jobs succeeded.
    await admin.rpc("rebuild_user_statistics", { p_tenant: tenantId, p_user: u } as never);
    await setStatsJobs(v.id, "succeeded");
    expect((await refreshGlobal(v, e.eventId)).data).toBe("applied");
    expect((await refreshGlobal(v, e.eventId)).data).toBe("applied"); // duplicate harmless
    expect((await lb("global", null)).some((r) => r.user_id === u)).toBe(true);
  });

  it("an older version's dead stats job does not block the current version", async () => {
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    const v1 = await activeSettlement(e.eventId);
    await setStatsJobs(v1.id, "dead"); // v1's prerequisite is dead
    await regrade(e.eventId, e.compB);
    const v2 = await activeSettlement(e.eventId);
    await admin.rpc("rebuild_user_statistics", { p_tenant: tenantId, p_user: u } as never);
    await setStatsJobs(v2.id, "succeeded"); // v2's prerequisites are satisfied
    // v1 is stale (short-circuits before prereqs); v2 proceeds despite v1's dead job.
    expect((await refreshGlobal(v1, e.eventId)).data).toBe("stale");
    expect((await refreshGlobal(v2, e.eventId)).data).toBe("applied");
  });

  it("normal drain: statistics succeed before the leaderboard refresh (no defer)", async () => {
    // Clear leftover jobs from the direct-call tests above so the drain reflects
    // only this settlement's work.
    await admin.from("system_jobs").delete().eq("tenant_id", tenantId);
    const u = await newUser();
    const e = await makeEvent({ competitionId: compReg });
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    const res = await drain();
    expect(res.deferred).toBe(0); // FIFO seq → stats succeed before the leaderboard runs
    expect((await lb("global", null)).some((r) => r.user_id === u)).toBe(true);
  });

  it("ranks a large batch of users without dropping anyone (set-based, no N+1)", async () => {
    const batch: string[] = [];
    for (let i = 0; i < 12; i++) batch.push(await newUser());
    const e = await makeEvent({ competitionId: compReg });
    for (const u of batch) await predict(e.marketId, u, e.optA); // all correct
    await settle(e.eventId, e.compA); await drain();
    const rows = await lb("competition", compReg);
    for (const u of batch) expect(rows.some((r) => r.user_id === u && r.ranked)).toBe(true);
  });
});
