// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";
import { reconcile, requeueActionableJobs, getProjectionJobStats, getProjectionHealth } from "@/lib/ops/reconciliation";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Reconciliation, repair & operational visibility (§5H). Reconciliation rebuilds
 * derived projections from authoritative grades (reusing the deterministic
 * rebuilds); dry-run detects drift without writing; repair fixes it idempotently;
 * requeue revives actionable failures; health/stats expose operability.
 */
d("reconciliation & operational visibility", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let comp: string;
  let A: string, B: string;
  let u1: string, u2: string;
  let keyN = 0;
  const key = () => `re-${s}-${keyN++}-abcdefgh`;

  const settle = (eventId: string, winner: string) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const regrade = (eventId: string, winner: string) =>
    admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_reason: "c", p_idempotency_key: key(), p_winning_option_ids: null } as never);
  const drain = () => drainJobs(admin, tenantId);
  const activeSettlement = async (eventId: string) => (await admin.from("settlements").select("id, grading_version").eq("event_id", eventId).eq("status", "active").single()).data!;
  const statsOf = async (user: string) => (await admin.from("user_statistics").select("total_points, correct_predictions").eq("tenant_id", tenantId).eq("user_id", user).maybeSingle()).data;
  const clearJobs = () => admin.from("system_jobs").delete().eq("tenant_id", tenantId);
  const statsJobId = async (settlementId: string, user: string) =>
    (await admin.from("system_jobs").select("id").eq("job_type", "projection.user_stats").filter("payload->>settlement_id", "eq", settlementId).filter("payload->>user_id", "eq", user).limit(1).maybeSingle()).data?.id;

  async function makeEvent() {
    const suf = uniqueSuffix();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, competition_id: comp, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() }).select("id").single();
    for (const cid of [A, B]) await admin.from("event_competitors").insert({ tenant_id: tenantId, event_id: ev!.id, competitor_id: cid } as never);
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    const { data: opts } = await admin.from("market_options").insert([
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: A, label: "A", display_order: 0 },
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: B, label: "B", display_order: 1 },
    ]).select("id, competitor_id");
    const optA = opts!.find((o) => o.competitor_id === A)!.id, optB = opts!.find((o) => o.competitor_id === B)!.id;
    await admin.from("predictions").insert({ tenant_id: tenantId, market_id: mkt!.id, user_id: u1, option_id: optA, original_option_id: optA, idempotency_key: `p-${uniqueSuffix()}`, status: "active" } as never);
    await admin.from("predictions").insert({ tenant_id: tenantId, market_id: mkt!.id, user_id: u2, option_id: optB, original_option_id: optB, idempotency_key: `p-${uniqueSuffix()}`, status: "active" } as never);
    return ev!.id;
  }

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `re-${s}`, display_name: "RE" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    ownerId = await createUser(`reowner-${s}@example.test`, pw);
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
    u1 = await createUser(`reu1-${s}@example.test`, pw);
    u2 = await createUser(`reu2-${s}@example.test`, pw);
    for (const uid of [u1, u2]) await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uid, role: "member" });
    await admin.from("competitor_draft_assignments").insert([
      { tenant_id: tenantId, competition_id: comp, competitor_id: A, user_id: u1, status: "confirmed", assignment_source: "user_selected", payment_status: "not_required", exclusive_slot: true, reserved_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), idempotency_key: `asg-${uniqueSuffix()}` },
      { tenant_id: tenantId, competition_id: comp, competitor_id: B, user_id: u2, status: "confirmed", assignment_source: "user_selected", payment_status: "not_required", exclusive_slot: true, reserved_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), idempotency_key: `asg-${uniqueSuffix()}` },
    ] as never);
  }, 60_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, u1, u2]) if (id) await deleteUser(id);
  });

  it("a clean dry-run reports zero differences (async state is already canonical)", async () => {
    const e = await makeEvent();
    await settle(e, A); await drain();
    const r = await reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "dry_run", idempotencyKey: key() });
    expect(r.differences_found).toBe(0);
    const t = await reconcile(admin, { tenantId, scope: "tenant", mode: "dry_run", idempotencyKey: key() });
    expect(t.differences_found).toBe(0); // incremental == canonical
  });

  it("detects and repairs corrupted user statistics, idempotently", async () => {
    const e = await makeEvent();
    await settle(e, A); await drain();
    await admin.from("user_statistics").update({ total_points: 999, current_streak: 42 }).eq("tenant_id", tenantId).eq("user_id", u1);

    const dry = await reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "dry_run", idempotencyKey: key() });
    expect(dry.differences_found).toBeGreaterThanOrEqual(1); // drift detected
    expect((await statsOf(u1))!.total_points).toBe(999); // dry-run wrote nothing

    const rep = await reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "repair", idempotencyKey: key() });
    expect(rep.repairs_applied).toBeGreaterThanOrEqual(1);
    expect((await statsOf(u1))!.total_points).not.toBe(999); // restored to canonical

    // Repeated repair / dry-run on the now-correct scope finds nothing.
    expect((await reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "dry_run", idempotencyKey: key() })).differences_found).toBe(0);
    expect((await reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "repair", idempotencyKey: key() })).repairs_applied).toBe(0);
  });

  it("repairs a corrupted competition leaderboard + draft standings", async () => {
    const e = await makeEvent();
    await settle(e, A); await drain();
    await admin.from("leaderboard_snapshots").update({ total_points: 12345 }).eq("tenant_id", tenantId).eq("scope", "competition").eq("scope_id", comp);
    await admin.from("draft_leaderboard_snapshots").update({ competition_points: 55555 }).eq("competition_id", comp);
    const rep = await reconcile(admin, { tenantId, scope: "competition", scopeId: comp, mode: "repair", idempotencyKey: key() });
    expect(rep.differences_found).toBeGreaterThanOrEqual(1);
    expect((await admin.from("leaderboard_snapshots").select("total_points").eq("scope", "competition").eq("scope_id", comp)).data!.every((r) => r.total_points !== 12345)).toBe(true);
    expect((await admin.from("draft_leaderboard_snapshots").select("competition_points").eq("competition_id", comp)).data!.every((r) => r.competition_points !== 55555)).toBe(true);
  });

  it("requeues a current dead-lettered job (repair job created) but NOT an old-version one", async () => {
    await clearJobs();
    const e = await makeEvent();
    await settle(e, A);
    const v = await activeSettlement(e);
    const jid = await statsJobId(v.id, u1);
    await admin.from("system_jobs").update({ status: "dead", error: "boom" }).eq("id", jid!);

    const requeuedCurrent = await requeueActionableJobs(admin, tenantId);
    expect(requeuedCurrent).toBeGreaterThanOrEqual(1); // current dead-letter is actionable
    // Original preserved; a repair job referencing it exists.
    expect((await admin.from("system_jobs").select("status").eq("id", jid!).single()).data!.status).toBe("dead");
    expect((await admin.from("system_jobs").select("id").eq("dedup_key", `repair:${jid}`)).data!).toHaveLength(1);
    // Idempotent: a second requeue creates no new repair job.
    await requeueActionableJobs(admin, tenantId);
    expect((await admin.from("system_jobs").select("id").eq("dedup_key", `repair:${jid}`)).data!).toHaveLength(1);

    // Now supersede that version; the old dead job becomes historical, not requeued.
    await clearJobs();
    const e2 = await makeEvent();
    await settle(e2, A);
    const v1 = await activeSettlement(e2);
    const jid2 = await statsJobId(v1.id, u1);
    await admin.from("system_jobs").update({ status: "dead" }).eq("id", jid2!);
    await regrade(e2, B); // v1 superseded
    await admin.from("system_jobs").delete().eq("job_type", "projection.user_stats").filter("payload->>settlement_id", "eq", (await activeSettlement(e2)).id); // remove v2 stats noise
    const requeuedHistorical = await requeueActionableJobs(admin, tenantId);
    expect((await admin.from("system_jobs").select("id").eq("dedup_key", `repair:${jid2}`)).data!).toHaveLength(0); // historical not requeued
    void requeuedHistorical;
  });

  it("detects and requeues a stuck running job while preserving the original", async () => {
    await clearJobs();
    const e = await makeEvent();
    await settle(e, A);
    const v = await activeSettlement(e);
    const jid = await statsJobId(v.id, u1);
    await admin.from("system_jobs").update({ status: "running", started_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("id", jid!);
    const n = await requeueActionableJobs(admin, tenantId, 15);
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await admin.from("system_jobs").select("status").eq("id", jid!).single()).data!.status).toBe("running"); // original preserved
    expect((await admin.from("system_jobs").select("id").eq("dedup_key", `repair:${jid}`)).data!).toHaveLength(1);
  });

  it("an incomplete fan-out resumes from its durable cursor with no duplicate recipients", async () => {
    await clearJobs();
    const followers = [];
    for (let i = 0; i < 3; i++) { const u = await createUser(`ref-${uniqueSuffix()}@example.test`, pw); await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: u, role: "member" }); await admin.from("creator_follows").insert({ tenant_id: tenantId, creator_id: creatorId, user_id: u }); followers.push(u); }
    const suf = uniqueSuffix();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, creator_id: creatorId, title: "P", slug: `p-${suf}`, status: "open", starts_at: new Date(Date.now() + 3_600_000).toISOString(), locks_at: new Date(Date.now() + 7_200_000).toISOString() }).select("id").single();
    const fo = (await admin.from("notification_fanouts").select("id").eq("source_id", ev!.id).single()).data!;
    // Process only the first recipient, then mark the fan-out job dead (interrupted).
    await admin.rpc("process_event_publish_fanout", { p_fanout_id: fo.id, p_batch_size: 1 } as never);
    await admin.from("system_jobs").update({ status: "dead" }).eq("job_type", "projection.event_publish_fanout").filter("payload->>fanout_dedup", "eq", `x`); // no-op guard
    await admin.from("system_jobs").update({ status: "dead" }).eq("job_type", "projection.event_publish_fanout").eq("tenant_id", tenantId);

    await requeueActionableJobs(admin, tenantId); // requeues the dead fan-out job
    await drain();                                 // resumes from the durable cursor
    let total = 0;
    for (const u of followers) total += ((await admin.from("notifications").select("id").eq("tenant_id", tenantId).eq("user_id", u).eq("type", "new_creator_event")).data ?? []).length;
    expect(total).toBe(3); // all recipients, each exactly once
    expect((await admin.from("notification_fanouts").select("status").eq("id", fo.id).single()).data!.status).toBe("completed");
    for (const u of followers) await deleteUser(u);
  });

  it("rejects reconciliation by an ordinary user and across tenants", async () => {
    const member = await signInAs(`reu1-${s}@example.test`, pw);
    const denied = await member.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: key() } as never);
    expect(denied.error?.message).toMatch(/NOT_AUTHORIZED/);

    // A competition owned by another tenant cannot be reconciled under this one.
    const { data: t2 } = await admin.from("tenants").insert({ slug: `re2-${s}`, display_name: "RE2" }).select("id").single();
    const { data: oc2 } = await admin.from("creators").insert({ tenant_id: t2!.id, owner_user_id: ownerId, display_name: "C2", slug: `c2-${s}`, verification_status: "verified" }).select("id").single();
    const { data: oc } = await admin.from("competitions").insert({ tenant_id: t2!.id, creator_id: oc2!.id, type: "TOURNAMENT", title: "Other", slug: `oc-${s}`, status: "active" }).select("id").single();
    try {
      const cross = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "competition", p_scope_id: oc!.id, p_mode: "dry_run", p_idempotency_key: key() } as never);
      expect(cross.error?.message).toMatch(/CROSS_TENANT_SCOPE/);
      // ...while the same competition under its own tenant is accepted.
      const ok = await admin.rpc("reconcile", { p_tenant: t2!.id, p_scope_type: "competition", p_scope_id: oc!.id, p_mode: "dry_run", p_idempotency_key: key() } as never);
      expect(ok.error).toBeNull();
    } finally { await admin.from("tenants").delete().eq("id", t2!.id); }
  });

  it("concurrent identical reconcile requests create exactly one run", async () => {
    const k = key();
    const [a, b] = await Promise.all([
      reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "dry_run", idempotencyKey: k }),
      reconcile(admin, { tenantId, scope: "user", scopeId: u1, mode: "dry_run", idempotencyKey: k }),
    ]);
    expect(a.run_id).toBe(b.run_id);
    expect((await admin.from("reconciliation_runs").select("id").eq("idempotency_key", k)).data!).toHaveLength(1);
  });

  it("projection health reflects healthy / blocked / degraded and ignores stale history", async () => {
    await clearJobs();
    expect((await getProjectionHealth(admin, tenantId)).state).toBe("healthy");

    // A current-version dead prerequisite → blocked.
    const e = await makeEvent();
    await settle(e, A);
    const v = await activeSettlement(e);
    await admin.from("system_jobs").update({ status: "dead" }).eq("id", (await statsJobId(v.id, u1))!);
    expect((await getProjectionHealth(admin, tenantId)).state).toBe("blocked");

    // Supersede → the dead job is now stale history → no longer blocked/critical.
    await regrade(e, B); await drain();
    const afterRegrade = await getProjectionHealth(admin, tenantId);
    expect(["healthy", "delayed", "degraded"]).toContain(afterRegrade.state);
    expect(afterRegrade.state).not.toBe("blocked");

    // Ops stats are typed and countable.
    const stats = await getProjectionJobStats(admin, tenantId);
    expect(typeof stats.dead).toBe("number");
    expect(typeof stats.oldest_pending_seconds).toBe("number");
  });
});
