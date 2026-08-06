// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Async settlement enqueue integration (§5B). The synchronous settlement is
 * authoritative and commits immutable grades; derived projections are durable,
 * version-aware jobs enqueued in the same transaction (outbox).
 */
d("async settlement — enqueue integration", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let u1: string, u2: string, u3: string;
  let keyN = 0;
  const key = () => `as-${s}-${keyN++}-abcdefgh`;

  async function makeEvent() {
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
      .insert({ tenant_id: tenantId, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() })
      .select("id").single();
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    const { data: opts } = await admin
      .from("market_options")
      .insert([
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compA, label: "A", display_order: 0 },
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compB, label: "B", display_order: 1 },
      ])
      .select("id, competitor_id");
    return { eventId: ev!.id, marketId: mkt!.id, compA, compB, optA: opts!.find((o) => o.competitor_id === compA)!.id };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${uniqueSuffix()}`, status: "active" });
  const settle = (eventId: string, winner: string | null, k = key()) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: winner ? "settled" : "voided", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: k, p_winning_option_ids: null } as never);
  const regrade = (eventId: string, winner: string, k = key()) =>
    admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_reason: "corr", p_idempotency_key: k, p_winning_option_ids: null } as never);
  const activeSettlementId = async (eventId: string) =>
    (await admin.from("settlements").select("id").eq("event_id", eventId).eq("status", "active").single()).data!.id;
  const jobsFor = async (settlementId: string) =>
    (await admin.from("system_jobs").select("job_type, status, payload").filter("payload->>settlement_id", "eq", settlementId)).data!;
  const statsOf = async (user: string) =>
    (await admin.from("user_statistics").select("total_points").eq("tenant_id", tenantId).eq("user_id", user).maybeSingle()).data;

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `as-${s}`, display_name: "Async" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId });
    ownerId = await createUser(`asowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    u1 = await createUser(`asu1-${s}@example.test`, pw);
    u2 = await createUser(`asu2-${s}@example.test`, pw);
    u3 = await createUser(`asu3-${s}@example.test`, pw);
    for (const uid of [u1, u2, u3]) await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uid, role: "member" });
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, u1, u2]) if (id) await deleteUser(id);
  });

  it("commits grades synchronously but defers projections to the worker", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u1, e.optA);
    const res = await settle(e.eventId, e.compA);
    expect(res.error).toBeNull();
    // Authoritative state is present WITHOUT running the worker:
    const { data: grades } = await admin.from("settlement_grades").select("outcome").eq("event_id", e.eventId);
    expect(grades!.length).toBe(1);
    expect(grades![0]!.outcome).toBe("correct");
    // Projection is NOT applied yet (no worker has run):
    expect(await statsOf(u1)).toBeNull();
    // ...and becomes correct once the worker drains — settlement correctness never
    // depended on the worker.
    await drainJobs(admin, tenantId);
    expect((await statsOf(u1))!.total_points).toBe(1);
  });

  it("enqueues each required projection job exactly once (and retry does not duplicate)", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u1, e.optA);
    await predict(e.marketId, u2, e.optA);
    const k = key();
    await settle(e.eventId, e.compA, k);
    const sid = await activeSettlementId(e.eventId);
    const jobs1 = await jobsFor(sid);
    const types = jobs1.map((j) => j.job_type).sort();
    // 2 users × (stats + achievements) + 2 leaderboard scopes (global + creator; no
    // competition on this event) + draft + feed + notify = 9
    expect(jobs1.length).toBe(9);
    expect(types.filter((t) => t === "projection.user_stats").length).toBe(2);
    expect(types.filter((t) => t === "projection.achievements").length).toBe(2);
    expect(types.filter((t) => t === "projection.leaderboard").length).toBe(2); // global + creator
    expect(new Set(types)).toEqual(new Set([
      "projection.user_stats", "projection.achievements", "projection.leaderboard",
      "projection.draft_standings", "projection.feed", "projection.notify_settlement",
    ]));
    // Idempotent settle replay (same key) enqueues nothing new.
    await settle(e.eventId, e.compA, k);
    expect((await jobsFor(sid)).length).toBe(9);
  });

  it("regrade enqueues jobs for the NEW version; old-version jobs stay visible but cannot become authoritative", async () => {
    const e = await makeEvent();
    await predict(e.marketId, u3, e.optA); // u3 (isolated) picks A
    await settle(e.eventId, e.compA); // v1: A wins → u3 correct
    const v1 = await activeSettlementId(e.eventId);

    // Regrade to B BEFORE draining v1's jobs. Now v2 is active; both versions' jobs are pending.
    await regrade(e.eventId, e.compB); // v2: B wins → u1 incorrect
    const v2 = await activeSettlementId(e.eventId);
    expect(v2).not.toBe(v1);
    // 1 user × (stats + achievements) + 2 leaderboard scopes + draft + feed + notify = 7.
    expect((await jobsFor(v2)).length).toBe(7); // fresh job set for v2

    // Drain everything: v1's jobs see v2 active and skip (canceled), regardless of order.
    await drainJobs(admin, tenantId);

    const v1jobs = await jobsFor(v1);
    expect(v1jobs.length).toBe(7);
    expect(v1jobs.every((j) => j.status === "canceled")).toBe(true); // superseded, visible
    // The authoritative projection reflects v2 (u3 now incorrect → 0 points), NOT v1.
    expect((await statsOf(u3))!.total_points).toBe(0);
  });
});
