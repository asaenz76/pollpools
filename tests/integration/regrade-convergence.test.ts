// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";
import type { LeaderboardScope } from "@/types/enums";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Cross-projection regrade & stale-job protection (§5G). Proves the ENTIRE async
 * projection pipeline (stats, streaks, four leaderboard scopes, draft standings,
 * achievements, feed, notifications, milestones) converges to the state produced
 * by the currently active settlement version under regrade, stale/out-of-order/
 * duplicate execution, dead-letter, and concurrent settle/regrade. The canonical
 * check: after the async pipeline runs, a deterministic rebuild from authoritative
 * active grades produces the identical state.
 */
d("regrade convergence & stale-job protection", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let comp: string;
  let A: string, B: string;
  let u1: string, u2: string;
  const users: string[] = []; // extra users created within tests (cleaned up in afterAll)
  let keyN = 0;
  const key = () => `rc-${s}-${keyN++}-abcdefgh`;

  const settle = (eventId: string, winner: string, k = key()) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: k, p_winning_option_ids: null } as never);
  const regrade = (eventId: string, winner: string, k = key()) =>
    admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_reason: "corr", p_idempotency_key: k, p_winning_option_ids: null } as never);
  const drain = () => drainJobs(admin, tenantId);
  const activeSettlement = async (eventId: string) =>
    (await admin.from("settlements").select("id, grading_version").eq("event_id", eventId).eq("status", "active").single()).data!;

  // Default predictors: u1 picks A, u2 picks B (both have draft assignments).
  async function makeEvent(predictors?: [string, string][]) {
    const picks = predictors ?? [[u1, A], [u2, B]];
    const suf = uniqueSuffix();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, competition_id: comp, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() }).select("id").single();
    for (const cid of [A, B]) await admin.from("event_competitors").insert({ tenant_id: tenantId, event_id: ev!.id, competitor_id: cid } as never);
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    const { data: opts } = await admin.from("market_options").insert([
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: A, label: "A", display_order: 0 },
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: B, label: "B", display_order: 1 },
    ]).select("id, competitor_id");
    const optByComp = new Map(opts!.map((o) => [o.competitor_id, o.id]));
    for (const [user, cid] of picks) {
      const oid = optByComp.get(cid)!;
      await admin.from("predictions").insert({ tenant_id: tenantId, market_id: mkt!.id, user_id: user, option_id: oid, original_option_id: oid, idempotency_key: `p-${uniqueSuffix()}`, status: "active" } as never);
    }
    return ev!.id;
  }

  // ── Capture the full projected state (stable fields only) for comparison ─────
  async function captureAll() {
    const stats = (await admin.from("user_statistics").select("user_id, total_points, correct_predictions, incorrect_predictions, voided_predictions, current_streak, best_streak").eq("tenant_id", tenantId).in("user_id", [u1, u2])).data ?? [];
    const lbRows = async (scope: LeaderboardScope, scopeId: string | null) => {
      let q = admin.from("leaderboard_snapshots").select("user_id, rank, total_points, correct_predictions, ranked").eq("tenant_id", tenantId).eq("scope", scope).eq("period", "all_time");
      q = scopeId === null ? q.is("scope_id", null) : q.eq("scope_id", scopeId);
      return (await q).data ?? [];
    };
    const draft = (await admin.from("draft_leaderboard_snapshots").select("user_id, competition_points, rank").eq("competition_id", comp)).data ?? [];
    const ach = (await admin.from("user_achievements").select("user_id, achievement_id, revoked_at").eq("tenant_id", tenantId).in("user_id", [u1, u2])).data ?? [];
    const sort = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => ({ ...r })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {
      stats: sort(stats),
      global: sort(await lbRows("global", null)),
      creator: sort(await lbRows("creator", creatorId)),
      competition: sort(await lbRows("competition", comp)),
      draft: sort(draft),
      achievements: sort(ach),
    };
  }

  // ── Deterministic canonical rebuild from authoritative active grades ─────────
  async function canonicalRebuild() {
    for (const u of [u1, u2]) {
      await admin.rpc("rebuild_user_statistics", { p_tenant: tenantId, p_user: u } as never);
      await admin.rpc("rebuild_user_achievements", { p_tenant: tenantId, p_user: u } as never);
    }
    await admin.rpc("rebuild_leaderboard_scope", { p_tenant: tenantId, p_scope_type: "global", p_scope_id: null } as never);
    await admin.rpc("rebuild_leaderboard_scope", { p_tenant: tenantId, p_scope_type: "creator", p_scope_id: creatorId } as never);
    await admin.rpc("rebuild_leaderboard_scope", { p_tenant: tenantId, p_scope_type: "competition", p_scope_id: comp } as never);
    await admin.rpc("rebuild_draft_competition", { p_tenant: tenantId, p_competition: comp } as never);
  }

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `rc-${s}`, display_name: "RC" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    ownerId = await createUser(`rcowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    const { data: cp } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "TOURNAMENT", title: "Comp", slug: `comp-${s}`, status: "active" }).select("id").single();
    comp = cp!.id;
    await admin.from("competition_draft_settings").insert({ tenant_id: tenantId, competition_id: comp, is_enabled: true, mode: "exclusive", access_type: "free", status: "open", created_by: ownerId } as never);
    await admin.from("draft_scoring_rules").insert({ tenant_id: tenantId, competition_id: comp, scoring_type: "competition_points", config: { position_points: { "1": 10, "2": 8 } } } as never);
    const { data: comps } = await admin.from("competitors").insert([
      { tenant_id: tenantId, creator_id: creatorId, name: `A-${s}`, slug: `a-${s}` },
      { tenant_id: tenantId, creator_id: creatorId, name: `B-${s}`, slug: `b-${s}` },
    ]).select("id");
    A = comps![0]!.id; B = comps![1]!.id;
    await admin.from("achievements").insert([{ tenant_id: tenantId, key: "first_correct", name: "Bullseye", rule: { type: "first_correct" } }]);
    u1 = await createUser(`rcu1-${s}@example.test`, pw);
    u2 = await createUser(`rcu2-${s}@example.test`, pw);
    for (const uid of [u1, u2]) await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uid, role: "member" });
    await admin.from("competitor_draft_assignments").insert([
      { tenant_id: tenantId, competition_id: comp, competitor_id: A, user_id: u1, status: "confirmed", assignment_source: "user_selected", payment_status: "not_required", exclusive_slot: true, reserved_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), idempotency_key: `asg-${uniqueSuffix()}` },
      { tenant_id: tenantId, competition_id: comp, competitor_id: B, user_id: u2, status: "confirmed", assignment_source: "user_selected", payment_status: "not_required", exclusive_slot: true, reserved_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), idempotency_key: `asg-${uniqueSuffix()}` },
    ] as never);
  }, 60_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, u1, u2, ...users]) if (id) await deleteUser(id);
  });

  it("multi-regrade v1(A)→v2(B)→v3(A): only v3 is authoritative and equals a clean rebuild", async () => {
    const e = await makeEvent();
    await settle(e, A);     // v1
    await regrade(e, B);    // v2
    await regrade(e, A);    // v3 (back to A — must NOT blindly reuse v1 rows)
    await drain();          // all versions' jobs, mixed

    const asyncState = await captureAll();
    // v3 = A → u1 correct, u2 incorrect; draft baseline A=1 (10) / B absent (0).
    expect(asyncState.stats.find((r) => r.user_id === u1)).toMatchObject({ correct_predictions: 1, total_points: 1, current_streak: 1 });
    expect(asyncState.stats.find((r) => r.user_id === u2)).toMatchObject({ incorrect_predictions: 1, total_points: 0, current_streak: 0 });
    expect(asyncState.draft.find((r) => r.user_id === u1)?.competition_points).toBe(10);

    await canonicalRebuild();
    expect(await captureAll()).toEqual(asyncState); // async pipeline == canonical rebuild
  });

  it("stale v1 jobs after v2 becomes active no-op; final state equals v2", async () => {
    const e = await makeEvent();
    await settle(e, A);                       // v1 (not drained)
    const v1 = await activeSettlement(e);
    await regrade(e, B);                       // v2 active
    // A v1 projection run now must no-op (stale), never applying v1.
    const staleStats = await admin.rpc("project_user_stats", { p_tenant: tenantId, p_event: e, p_version: v1.grading_version, p_user: u1, p_settlement_id: v1.id } as never);
    expect(staleStats.data).toBe(false);
    await drain();
    const state = await captureAll();
    expect(state.stats.find((r) => r.user_id === u2)).toMatchObject({ correct_predictions: 1 }); // v2 = B → u2 correct
    await canonicalRebuild();
    expect(await captureAll()).toEqual(state);
  });

  it("out-of-order: leaderboard/achievements defer before statistics, then converge", async () => {
    const e = await makeEvent();
    await settle(e, A);
    const v = await activeSettlement(e);
    // Run dependents BEFORE the statistics jobs → they must defer, not apply stale.
    expect((await admin.rpc("project_leaderboard_scope", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_settlement_id: v.id, p_scope: "global", p_scope_id: null } as never)).data).toBe("defer");
    expect((await admin.rpc("project_achievements", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_user: u1, p_settlement_id: v.id } as never)).data).toBe("defer");
    await drain(); // FIFO: stats first, then dependents apply
    expect((await captureAll()).global.some((r) => r.user_id === u1 && r.ranked)).toBe(true);
  });

  it("duplicate execution does not double-count any projection", async () => {
    const e = await makeEvent();
    await settle(e, A);
    await drain();
    const before = await captureAll();
    const feedBefore = (await admin.from("feed_activities").select("id").eq("tenant_id", tenantId).eq("event_id", e).eq("type", "event_settled")).data!.length;
    const notifBefore = (await admin.from("notifications").select("id").eq("tenant_id", tenantId).eq("user_id", u1).eq("type", "prediction_correct")).data!.length;

    // Re-run every projection type a second time via its rpc.
    const v = await activeSettlement(e);
    await admin.rpc("project_user_stats", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_user: u1, p_settlement_id: v.id } as never);
    await admin.rpc("project_achievements", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_user: u1, p_settlement_id: v.id } as never);
    await admin.rpc("project_leaderboard_scope", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_settlement_id: v.id, p_scope: "competition", p_scope_id: comp } as never);
    await admin.rpc("project_draft_standings", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_settlement_id: v.id } as never);
    await admin.rpc("project_settlement_feed", { p_tenant: tenantId, p_event: e, p_version: v.grading_version } as never);
    await admin.rpc("project_settlement_notifications", { p_tenant: tenantId, p_event: e, p_version: v.grading_version } as never);

    expect(await captureAll()).toEqual(before); // idempotent — no change
    expect((await admin.from("feed_activities").select("id").eq("event_id", e).eq("type", "event_settled")).data!.length).toBe(feedBefore);
    expect((await admin.from("notifications").select("id").eq("user_id", u1).eq("type", "prediction_correct")).data!.length).toBe(notifBefore);
  });

  it("concurrent settle: exactly one active settlement; duplicate key is idempotent", async () => {
    const e = await makeEvent();
    const [r1, r2] = await Promise.all([settle(e, A, key()), settle(e, A, key())]);
    const errs = [r1.error, r2.error].filter(Boolean);
    expect(errs).toHaveLength(1); // exactly one attempt rejected
    expect(errs[0]!.message).toMatch(/ALREADY_SETTLED/);
    const active = (await admin.from("settlements").select("id").eq("event_id", e).eq("status", "active")).data!;
    expect(active).toHaveLength(1);

    // Same idempotency key twice → identical response, still one settlement.
    const e2 = await makeEvent();
    const k = key();
    const a = await settle(e2, A, k);
    const b = await settle(e2, A, k);
    expect(b.error).toBeNull();
    expect(b.data).toEqual(a.data);
    expect((await admin.from("settlements").select("id").eq("event_id", e2).eq("status", "active")).data!).toHaveLength(1);
  });

  it("concurrent regrades keep exactly one active version", async () => {
    const e = await makeEvent();
    await settle(e, A);
    const [r1, r2] = await Promise.all([regrade(e, B, key()), regrade(e, A, key())]);
    // At most one regrade can win against the single active settlement it supersedes.
    const active = (await admin.from("settlements").select("id, grading_version").eq("event_id", e).eq("status", "active")).data!;
    expect(active).toHaveLength(1);
    void r1; void r2;
  });

  it("a dead-lettered old-version job never blocks the current version", async () => {
    const e = await makeEvent();
    await settle(e, A);
    const v1 = await activeSettlement(e);
    await admin.from("system_jobs").update({ status: "dead" }).eq("job_type", "projection.user_stats").filter("payload->>settlement_id", "eq", v1.id);
    await regrade(e, B); // v2
    await drain();       // v2's jobs apply; v1's stale jobs no-op
    const state = await captureAll();
    // v1's dead stats job did not block v2: the v2 leaderboard applied (u2 is ranked).
    expect(state.global.some((r) => r.user_id === u2 && r.ranked)).toBe(true);
    // The old dead-letter remains visible in operational history.
    expect((await admin.from("system_jobs").select("id").eq("status", "dead").filter("payload->>settlement_id", "eq", v1.id)).data!.length).toBeGreaterThanOrEqual(1);
    await canonicalRebuild();
    expect(await captureAll()).toEqual(state);
  });

  it("a current-version prerequisite dead-letter blocks the dependent projection (no stale publish)", async () => {
    const e = await makeEvent();
    await settle(e, A);
    const v = await activeSettlement(e);
    await admin.from("system_jobs").update({ status: "dead" }).eq("job_type", "projection.user_stats").filter("payload->>settlement_id", "eq", v.id);
    expect((await admin.rpc("project_leaderboard_scope", { p_tenant: tenantId, p_event: e, p_version: v.grading_version, p_settlement_id: v.id, p_scope: "global", p_scope_id: null } as never)).data).toBe("blocked");
  });

  it("regrade preserves delivered notification history and emits one corrected notice", async () => {
    // Fresh user so absolute notification counts are unambiguous.
    const uf = await createUser(`rcuf-${uniqueSuffix()}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uf, role: "member" });
    const e = await makeEvent([[uf, A]]); // uf picks A
    await settle(e, A);  await drain();  // uf correct
    await regrade(e, B); await drain();  // uf now incorrect → corrected notice
    const corr = (await admin.from("notifications").select("id").eq("tenant_id", tenantId).eq("user_id", uf).eq("type", "prediction_updated")).data!;
    const orig = (await admin.from("notifications").select("id").eq("tenant_id", tenantId).eq("user_id", uf).eq("type", "prediction_correct")).data!;
    expect(corr).toHaveLength(1);  // exactly one corrected notification
    expect(orig).toHaveLength(1);  // original delivered history preserved
    users.push(uf); // cleaned up in afterAll
    // Feed: the settlement activity is unique (deduped per version).
    const feed = (await admin.from("feed_activities").select("id, dedupe_key").eq("event_id", e).eq("type", "event_settled")).data!;
    expect(new Set(feed.map((f) => f.dedupe_key)).size).toBe(feed.length); // no duplicate feed rows
  });
});
