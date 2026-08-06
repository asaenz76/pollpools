// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Incremental user statistics + streak projections (§5C). Statistics derive only
 * from active settlement grades; streaks are recomputed from the user's grades in
 * a stable chronological order (event start → active-settlement activation →
 * event id), never by ±1/reset mutation.
 */
d("user statistics & streak projections", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  const users: string[] = [];
  let keyN = 0;
  const key = () => `us-${s}-${keyN++}-abcdefgh`;

  async function newUser() {
    const id = await createUser(`us-${uniqueSuffix()}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: id, role: "member" });
    users.push(id);
    return id;
  }

  // startsAt lets tests control chronological order (and force same-timestamp ties).
  async function makeEvent(startsAtMs: number) {
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
      .insert({ tenant_id: tenantId, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(startsAtMs).toISOString(), locks_at: new Date(startsAtMs + 3_600_000).toISOString() })
      .select("id").single();
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    const { data: opts } = await admin
      .from("market_options")
      .insert([
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compA, label: "A", display_order: 0 },
        { tenant_id: tenantId, market_id: mkt!.id, competitor_id: compB, label: "B", display_order: 1 },
      ])
      .select("id, competitor_id");
    return { eventId: ev!.id, marketId: mkt!.id, compA, compB, optA: opts!.find((o) => o.competitor_id === compA)!.id, optB: opts!.find((o) => o.competitor_id === compB)!.id };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${uniqueSuffix()}`, status: "active" });
  const settle = (eventId: string, winner: string | null) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: winner ? "settled" : "voided", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const regrade = (eventId: string, winner: string | null) =>
    admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: winner ? "settled" : "voided", p_winning_competitor_id: winner, p_reason: "corr", p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const drain = () => drainJobs(admin, tenantId);
  const statsOf = async (user: string) =>
    (await admin.from("user_statistics")
      .select("total_predictions, correct_predictions, incorrect_predictions, voided_predictions, total_points, current_streak, best_streak")
      .eq("tenant_id", tenantId).eq("user_id", user).maybeSingle()).data;
  const activeSettlement = async (eventId: string) =>
    (await admin.from("settlements").select("id, grading_version").eq("event_id", eventId).eq("status", "active").single()).data!;

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `us-${s}`, display_name: "Stats" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId });
    ownerId = await createUser(`usowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, ...users]) if (id) await deleteUser(id);
  });

  it("recomputes only affected users; unaffected users are untouched", async () => {
    const u1 = await newUser(), u2 = await newUser(), u3 = await newUser();
    const e = await makeEvent(Date.now() - 3_600_000);
    await predict(e.marketId, u1, e.optA); // correct
    await predict(e.marketId, u2, e.optB); // incorrect
    // u3 does not predict this event.
    await settle(e.eventId, e.compA);
    await drain();
    expect(await statsOf(u1)).toMatchObject({ correct_predictions: 1, current_streak: 1, total_points: 1 });
    expect(await statsOf(u2)).toMatchObject({ incorrect_predictions: 1, current_streak: 0 });
    expect(await statsOf(u3)).toBeNull(); // never graded → no stats row
  });

  it("streak: correct increments, void has no effect, incorrect resets; best_streak retained", async () => {
    const u = await newUser();
    const e1 = await makeEvent(Date.now() - 5_000_000);
    const e2 = await makeEvent(Date.now() - 4_000_000);
    const e3 = await makeEvent(Date.now() - 3_000_000);
    const e4 = await makeEvent(Date.now() - 2_000_000);
    await predict(e1.marketId, u, e1.optA);
    await predict(e2.marketId, u, e2.optA);
    await predict(e3.marketId, u, e3.optA);
    await predict(e4.marketId, u, e4.optA);
    await settle(e1.eventId, e1.compA);        // correct → streak 1
    await settle(e2.eventId, null);            // VOID   → streak unchanged (1)
    await settle(e3.eventId, e3.compA);        // correct → streak 2 (best 2)
    await settle(e4.eventId, e4.compB);        // incorrect → streak 0
    await drain();
    expect(await statsOf(u)).toMatchObject({
      correct_predictions: 2, incorrect_predictions: 1, voided_predictions: 1,
      current_streak: 0, best_streak: 2,
    });
  });

  it("regrade correct→incorrect→correct yields the fully-rebuilt result each time", async () => {
    const u = await newUser();
    const e = await makeEvent(Date.now() - 3_600_000);
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA); await drain();
    expect(await statsOf(u)).toMatchObject({ correct_predictions: 1, current_streak: 1, total_points: 1 });
    await regrade(e.eventId, e.compB); await drain(); // now incorrect
    expect(await statsOf(u)).toMatchObject({ correct_predictions: 0, incorrect_predictions: 1, current_streak: 0, total_points: 0 });
    await regrade(e.eventId, e.compA); await drain(); // back to correct
    expect(await statsOf(u)).toMatchObject({ correct_predictions: 1, incorrect_predictions: 0, current_streak: 1, total_points: 1 });
  });

  it("stale-version job no-ops; duplicate + out-of-order execution are safe", async () => {
    const u = await newUser();
    const e = await makeEvent(Date.now() - 3_600_000);
    await predict(e.marketId, u, e.optA);
    await settle(e.eventId, e.compA);
    const v1 = await activeSettlement(e.eventId);
    await regrade(e.eventId, e.compB); // v2 active; u now incorrect
    const v2 = await activeSettlement(e.eventId);

    const call = (v: { id: string; grading_version: number }) =>
      admin.rpc("project_user_stats", { p_tenant: tenantId, p_event: e.eventId, p_version: v.grading_version, p_user: u, p_settlement_id: v.id } as never);

    // Stale v1 job → no-op (returns false), never applies v1's projection.
    expect((await call(v1)).data).toBe(false);
    // Apply v2 (active). Duplicate + out-of-order (v1 after v2) are idempotent no-ops.
    expect((await call(v2)).data).toBe(true);
    expect((await call(v2)).data).toBe(true); // duplicate
    expect((await call(v1)).data).toBe(false); // out-of-order stale
    expect(await statsOf(u)).toMatchObject({ correct_predictions: 0, incorrect_predictions: 1, current_streak: 0 });
  });

  it("rebuild_user_statistics equals the incremental projection result", async () => {
    const u = await newUser();
    const e1 = await makeEvent(Date.now() - 4_000_000);
    const e2 = await makeEvent(Date.now() - 3_000_000);
    await predict(e1.marketId, u, e1.optA);
    await predict(e2.marketId, u, e2.optA);
    await settle(e1.eventId, e1.compA);
    await settle(e2.eventId, e2.compA);
    await drain();
    const incremental = await statsOf(u);

    // Corrupt the row, then rebuild — the deterministic rebuild restores the truth.
    await admin.from("user_statistics").update({ total_points: 999, current_streak: 42, best_streak: 42 }).eq("tenant_id", tenantId).eq("user_id", u);
    const rb = await admin.rpc("rebuild_user_statistics", { p_tenant: tenantId, p_user: u } as never);
    expect(rb.error).toBeNull();
    expect(await statsOf(u)).toEqual(incremental);
  });

  it("orders same-timestamp events deterministically by event id (stable across rebuild)", async () => {
    const u = await newUser();
    const when = Date.now() - 3_600_000;
    const e1 = await makeEvent(when); // identical starts_at
    const e2 = await makeEvent(when); // identical starts_at
    // One correct, one incorrect. The streak depends on which sorts LAST by event id.
    await predict(e1.marketId, u, e1.optA); // A correct on e1
    await predict(e2.marketId, u, e2.optB); // B... will be incorrect on e2 (A wins)
    await settle(e1.eventId, e1.compA); // e1: u correct
    await settle(e2.eventId, e2.compA); // e2: u incorrect
    await drain();

    // Deterministic expectation: the event with the greater id is applied last.
    const lastEventIsE2 = e2.eventId > e1.eventId;
    const expectedStreak = lastEventIsE2 ? 0 /* ends on incorrect */ : 1 /* ends on correct */;
    const first = await statsOf(u);
    expect(first!.current_streak).toBe(expectedStreak);

    // Stable: a full rebuild produces the identical streak (id order is regrade-invariant).
    await admin.rpc("rebuild_user_statistics", { p_tenant: tenantId, p_user: u } as never);
    expect((await statsOf(u))!.current_streak).toBe(expectedStreak);
  });
});
