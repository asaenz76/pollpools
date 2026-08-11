// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Creator Event Lifecycle (EVT). Exercises the publish/lock/cancel/edit
 * transitions, creator settle + correct + void, and their interaction with
 * predictions, scoring, notifications, audit, and reconciliation — all through
 * the same settlement engine (settle_event / regrade_event) that already exists.
 * Authorization is verified with RLS-bound (signed-in) clients, never the
 * service-role admin client, so DB-side enforcement is what's under test.
 */
d("event lifecycle", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();

  let tenantId = "", foreignTenant = "";
  let creatorId = "";
  let ownerId = "", foreignOwnerId = "";
  const comps: string[] = [];
  const users: string[] = [];
  const members: string[] = []; // plain members (not the owner)

  let owner!: Awaited<ReturnType<typeof signInAs>>;
  let member!: Awaited<ReturnType<typeof signInAs>>;
  let foreign!: Awaited<ReturnType<typeof signInAs>>;

  const drain = () => drainJobs(admin, tenantId);

  // Build an event (default open) with SINGLE_CHOICE_WINNER options.
  async function makeEvent(
    slug: string,
    options: { label: string; competitor: string | null }[],
    opts: { status?: string; locksAt?: string } = {},
  ) {
    const { data: ev } = await admin.from("events").insert({
      tenant_id: tenantId, creator_id: creatorId, title: slug, slug: `${slug}-${s}-${randomUUID().slice(0, 4)}`,
      status: opts.status ?? "open",
      starts_at: new Date(Date.now() - 3600_000).toISOString(),
      locks_at: opts.locksAt ?? new Date(Date.now() + 3600_000).toISOString(),
    } as never).select("id").single();
    const { data: mkt } = await admin.from("markets").insert({
      tenant_id: tenantId, event_id: ev!.id, question: "Result?", type: "SINGLE_CHOICE_WINNER",
      status: opts.status === "draft" ? "draft" : "open",
      locks_at: opts.locksAt ?? new Date(Date.now() + 3600_000).toISOString(), // mirror create_event_with_market
    } as never).select("id").single();
    const { data: os } = await admin.from("market_options")
      .insert(options.map((o, i) => ({ tenant_id: tenantId, market_id: mkt!.id, competitor_id: o.competitor, label: o.label, display_order: i })) as never)
      .select("id, label");
    return { eventId: ev!.id, marketId: mkt!.id, opt: new Map((os as { id: string; label: string }[]).map((o) => [o.label, o.id])) };
  }
  const seedPredict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);
  const settleAs = (client: typeof owner, eventId: string, optionIds: string[] | null, winner: string | null = null) =>
    client.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: `st-${randomUUID()}`, p_winning_option_ids: optionIds } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `el-${s}`, display_name: "EL" } as never).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 } as never);

    ownerId = await createUser(`el-owner-${s}@example.test`, pw);
    users.push(ownerId);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "creator" } as never);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified", settlement_enabled: true } as never).select("id").single();
    creatorId = c!.id;
    const { data: cr } = await admin.from("competitors").insert(["Ava", "Ben"].map((n, i) => ({ tenant_id: tenantId, creator_id: creatorId, name: n, slug: `cx-${i}-${s}` })) as never).select("id");
    for (const x of cr as { id: string }[]) comps.push(x.id);

    for (let i = 0; i < 3; i++) {
      const u = await createUser(`el-m${i}-${s}@example.test`, pw);
      await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: u, role: "member" } as never);
      users.push(u); members.push(u);
    }

    // Foreign tenant + creator to prove cross-tenant rejection.
    const { data: ft } = await admin.from("tenants").insert({ slug: `elf-${s}`, display_name: "ELF" } as never).select("id").single();
    foreignTenant = ft!.id;
    foreignOwnerId = await createUser(`elf-owner-${s}@example.test`, pw);
    users.push(foreignOwnerId);
    await admin.from("tenant_memberships").insert({ tenant_id: foreignTenant, user_id: foreignOwnerId, role: "creator" } as never);
    await admin.from("creators").insert({ tenant_id: foreignTenant, owner_user_id: foreignOwnerId, display_name: "FC", slug: `fc-${s}`, verification_status: "verified", settlement_enabled: true } as never);

    owner = await signInAs(`el-owner-${s}@example.test`, pw);
    member = await signInAs(`el-m0-${s}@example.test`, pw);
    foreign = await signInAs(`elf-owner-${s}@example.test`, pw);
  }, 120_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, foreignTenant]);
    for (const u of users) if (u) await deleteUser(u);
  });

  // ── EDITING ────────────────────────────────────────────────────────────────
  describe("editing", () => {
    it("edits a draft event (owner)", async () => {
      const e = await makeEvent("edit-draft", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }], { status: "draft" });
      const r = await owner.rpc("update_event", { p_event_id: e.eventId, p_patch: { title: "Renamed", market_question: "Who wins?" } } as never);
      expect(r.error).toBeNull();
      expect((await admin.from("events").select("title").eq("id", e.eventId).single()).data!.title).toBe("Renamed");
      expect((await admin.from("markets").select("question").eq("id", e.marketId).single()).data!.question).toBe("Who wins?");
    });

    it("allows safe + structural edits on an OPEN event with no predictions", async () => {
      const e = await makeEvent("edit-open-nopred", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      const r = await owner.rpc("update_event", { p_event_id: e.eventId, p_patch: { description: "desc", options: [{ id: e.opt.get("Ava")!, label: "Ava Renamed" }] } } as never);
      expect(r.error).toBeNull();
      expect((await admin.from("market_options").select("label").eq("id", e.opt.get("Ava")!).single()).data!.label).toBe("Ava Renamed");
    });

    it("allows a SAFE edit but blocks structural edits once predictions exist", async () => {
      const e = await makeEvent("edit-withpred", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      // Safe edit is allowed.
      expect((await owner.rpc("update_event", { p_event_id: e.eventId, p_patch: { title: "Still Editable" } } as never)).error).toBeNull();
      // Structural edits are rejected.
      expect((await owner.rpc("update_event", { p_event_id: e.eventId, p_patch: { market_question: "changed?" } } as never)).error?.message).toContain("PREDICTIONS_EXIST");
      expect((await owner.rpc("update_event", { p_event_id: e.eventId, p_patch: { options: [{ id: e.opt.get("Ava")!, label: "hijack" }] } } as never)).error?.message).toContain("PREDICTIONS_EXIST");
    });

    it("rejects a cross-tenant edit", async () => {
      const e = await makeEvent("edit-xtenant", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      expect((await foreign.rpc("update_event", { p_event_id: e.eventId, p_patch: { title: "pwned" } } as never)).error?.message).toContain("NOT_AUTHORIZED");
    });

    it("rejects competitor/market-type changes (require recreate)", async () => {
      const e = await makeEvent("edit-structural", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      expect((await owner.rpc("update_event", { p_event_id: e.eventId, p_patch: { competitors: [comps[0]] } } as never)).error?.message).toContain("STRUCTURAL_CHANGE_REQUIRES_RECREATE");
    });
  });

  // ── LOCKING ──────────────────────────────────────────────────────────────
  describe("locking", () => {
    it("manually locks an open event and rejects new predictions afterward", async () => {
      const e = await makeEvent("lock-manual", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      // A member can predict while open.
      expect((await member.rpc("submit_prediction", { p_market_id: e.marketId, p_option_id: e.opt.get("Ava")!, p_idempotency_key: `sp-${randomUUID()}`, p_source: "web" } as never)).error).toBeNull();
      // Owner locks.
      expect((await owner.rpc("lock_event", { p_event_id: e.eventId } as never)).error).toBeNull();
      expect((await admin.from("events").select("status").eq("id", e.eventId).single()).data!.status).toBe("locked");
      expect((await admin.from("markets").select("status").eq("id", e.marketId).single()).data!.status).toBe("locked");
      // A different member is now rejected at the DB gate.
      const member2 = await signInAs(`el-m1-${s}@example.test`, pw);
      const rej = await member2.rpc("submit_prediction", { p_market_id: e.marketId, p_option_id: e.opt.get("Ben")!, p_idempotency_key: `sp-${randomUUID()}`, p_source: "web" } as never);
      expect(rej.error?.message).toMatch(/MARKET_NOT_OPEN|MARKET_LOCKED/);
    });

    it("is idempotent on duplicate lock", async () => {
      const e = await makeEvent("lock-idem", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      expect((await owner.rpc("lock_event", { p_event_id: e.eventId } as never)).error).toBeNull();
      const second = await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      expect(second.error).toBeNull();
      expect((second.data as { changed: boolean }).changed).toBe(false);
    });

    it("rejects an unauthorized lock", async () => {
      const e = await makeEvent("lock-unauth", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      expect((await member.rpc("lock_event", { p_event_id: e.eventId } as never)).error?.message).toContain("NOT_AUTHORIZED");
    });

    it("automatic lock produces the same locked state", async () => {
      const e = await makeEvent("lock-auto", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }], { locksAt: new Date(Date.now() - 1000).toISOString() });
      expect((await admin.rpc("lock_due_markets", {} as never)).error).toBeNull();
      expect((await admin.from("events").select("status").eq("id", e.eventId).single()).data!.status).toBe("locked");
      expect((await admin.from("markets").select("status").eq("id", e.marketId).single()).data!.status).toBe("locked");
    });
  });

  // ── CANCELING ──────────────────────────────────────────────────────────────
  describe("canceling", () => {
    it("cancels draft / open / locked and preserves predictions as non-scoring", async () => {
      for (const st of ["draft", "open", "locked"] as const) {
        const e = await makeEvent(`cancel-${st}`, [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }], { status: st === "draft" ? "draft" : "open" });
        if (st !== "draft") await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
        if (st === "locked") await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
        expect((await owner.rpc("cancel_event", { p_event_id: e.eventId, p_reason: "test" } as never)).error).toBeNull();
        expect((await admin.from("events").select("status").eq("id", e.eventId).single()).data!.status).toBe("canceled");
        expect((await admin.from("markets").select("status").eq("id", e.marketId).single()).data!.status).toBe("canceled");
        if (st !== "draft") {
          const preds = (await admin.from("predictions").select("status").eq("market_id", e.marketId)).data ?? [];
          expect(preds.length).toBe(1); // preserved, not deleted
          expect(preds[0]!.status).toBe("void"); // non-scoring
        }
      }
    });

    it("keeps scoring untouched: a canceled event writes no grades", async () => {
      const e = await makeEvent("cancel-noscore", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      await owner.rpc("cancel_event", { p_event_id: e.eventId } as never);
      await drain();
      expect((await admin.from("settlement_grades").select("*", { count: "exact", head: true }).eq("event_id", e.eventId)).count).toBe(0);
      expect((await admin.from("settlements").select("*", { count: "exact", head: true }).eq("event_id", e.eventId)).count).toBe(0);
      // Reconciliation still reports the canonical state (no drift).
      const rec = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `cancel-rec-${randomUUID()}` } as never);
      expect((rec.data as { differences_found: number }).differences_found).toBe(0);
    });

    it("is idempotent on duplicate cancel", async () => {
      const e = await makeEvent("cancel-idem", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      expect((await owner.rpc("cancel_event", { p_event_id: e.eventId } as never)).error).toBeNull();
      const second = await owner.rpc("cancel_event", { p_event_id: e.eventId } as never);
      expect(second.error).toBeNull();
      expect((second.data as { changed: boolean }).changed).toBe(false);
    });

    it("rejects settling a canceled event", async () => {
      const e = await makeEvent("cancel-then-settle", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await owner.rpc("cancel_event", { p_event_id: e.eventId } as never);
      expect((await settleAs(owner, e.eventId, [e.opt.get("Ava")!])).error?.message).toContain("EVENT_CANCELED");
    });

    it("rejects an unauthorized cancel", async () => {
      const e = await makeEvent("cancel-unauth", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      expect((await member.rpc("cancel_event", { p_event_id: e.eventId } as never)).error?.message).toContain("NOT_AUTHORIZED");
    });

    it("notifies affected participants exactly once", async () => {
      const e = await makeEvent("cancel-notify", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      await seedPredict(e.marketId, members[1]!, e.opt.get("Ben")!);
      await owner.rpc("cancel_event", { p_event_id: e.eventId } as never);
      await drain();
      const n1 = (await admin.from("notifications").select("id").eq("entity_id", e.eventId).eq("type", "event_canceled" as never)).data ?? [];
      expect(n1.length).toBe(2);
      await drain(); // dedup: re-draining sends nothing more
      const n2 = (await admin.from("notifications").select("id").eq("entity_id", e.eventId).eq("type", "event_canceled" as never)).data ?? [];
      expect(n2.length).toBe(2);
    });

    it("writes an audit row for the cancellation", async () => {
      const e = await makeEvent("cancel-audit", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await owner.rpc("cancel_event", { p_event_id: e.eventId, p_reason: "weather" } as never);
      const a = (await admin.from("audit_logs").select("action, summary").eq("entity_id", e.eventId).eq("action", "event.cancel")).data ?? [];
      expect(a.length).toBe(1);
    });
  });

  // ── SETTLEMENT ─────────────────────────────────────────────────────────────
  describe("settlement", () => {
    it("lets an authorized creator settle a locked event (grades + stats update)", async () => {
      const e = await makeEvent("settle-ok", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      await seedPredict(e.marketId, members[1]!, e.opt.get("Ben")!);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      expect((await settleAs(owner, e.eventId, [e.opt.get("Ava")!])).error).toBeNull();
      await drain();
      expect((await admin.from("predictions").select("status").eq("market_id", e.marketId).eq("user_id", members[0]!).single()).data!.status).toBe("correct");
      expect((await admin.from("predictions").select("status").eq("market_id", e.marketId).eq("user_id", members[1]!).single()).data!.status).toBe("incorrect");
      const rec = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `settle-rec-${randomUUID()}` } as never);
      expect((rec.data as { differences_found: number }).differences_found).toBe(0);
    });

    it("settles a non-competitor Draw outcome", async () => {
      const e = await makeEvent("settle-draw", [{ label: "Home", competitor: comps[0]! }, { label: "Draw", competitor: null }, { label: "Away", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Draw")!);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      expect((await settleAs(owner, e.eventId, [e.opt.get("Draw")!])).error).toBeNull();
      await drain();
      expect((await admin.from("event_results").select("winning_competitor_id").eq("event_id", e.eventId).order("grading_version", { ascending: false }).limit(1).single()).data!.winning_competitor_id).toBeNull();
      expect((await admin.from("predictions").select("status").eq("market_id", e.marketId).eq("user_id", members[0]!).single()).data!.status).toBe("correct");
    });

    it("rejects a second settle attempt", async () => {
      const e = await makeEvent("settle-twice", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      expect((await settleAs(owner, e.eventId, [e.opt.get("Ava")!])).error).toBeNull();
      expect((await settleAs(owner, e.eventId, [e.opt.get("Ben")!])).error?.message).toContain("ALREADY_SETTLED");
    });

    it("rejects settlement by a member without permission", async () => {
      const e = await makeEvent("settle-unauth", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      expect((await settleAs(member, e.eventId, [e.opt.get("Ava")!])).error?.message).toContain("NOT_AUTHORIZED");
    });
  });

  // ── REGRADE / CORRECT / VOID ────────────────────────────────────────────────
  describe("regrade, correct, void", () => {
    it("corrects a settled result: old version preserved, projections converge, one corrected notice", async () => {
      const e = await makeEvent("regrade-correct", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      await settleAs(owner, e.eventId, [e.opt.get("Ben")!]); // initially wrong: Ben
      await drain();
      // Correct to Ava.
      const rg = await owner.rpc("regrade_event", { p_event_id: e.eventId, p_resolution: "settled", p_winning_competitor_id: null, p_reason: "fix", p_idempotency_key: `rg-${randomUUID()}`, p_winning_option_ids: [e.opt.get("Ava")!] } as never);
      expect(rg.error).toBeNull();
      await drain();
      expect((await admin.from("settlements").select("*", { count: "exact", head: true }).eq("event_id", e.eventId)).count).toBe(2); // v1 preserved + v2
      expect((await admin.from("predictions").select("status").eq("market_id", e.marketId).eq("user_id", members[0]!).single()).data!.status).toBe("correct");
      const c1 = (await admin.from("notifications").select("id").eq("entity_id", e.eventId).eq("type", "prediction_updated" as never)).data?.length ?? 0;
      expect(c1).toBeGreaterThanOrEqual(1);
      await drain();
      const c2 = (await admin.from("notifications").select("id").eq("entity_id", e.eventId).eq("type", "prediction_updated" as never)).data?.length ?? 0;
      expect(c2).toBe(c1); // emitted once (deduped)
      const rec = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `rg-rec-${randomUUID()}` } as never);
      expect((rec.data as { differences_found: number }).differences_found).toBe(0);
    });

    it("voids a settled event (regrade-to-void) and blocks a plain cancel afterward", async () => {
      const e = await makeEvent("void-settled", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      await settleAs(owner, e.eventId, [e.opt.get("Ava")!]);
      await drain();
      // A settled event is NOT cancellable via cancel_event.
      expect((await owner.rpc("cancel_event", { p_event_id: e.eventId } as never)).error?.message).toContain("ALREADY_SETTLED");
      // The correction path (regrade-to-void) is how it becomes void.
      expect((await owner.rpc("regrade_event", { p_event_id: e.eventId, p_resolution: "voided", p_winning_competitor_id: null, p_reason: "abandoned", p_idempotency_key: `void-${randomUUID()}`, p_winning_option_ids: null } as never)).error).toBeNull();
      await drain();
      expect((await admin.from("events").select("status").eq("id", e.eventId).single()).data!.status).toBe("voided");
      expect((await admin.from("predictions").select("status").eq("market_id", e.marketId).eq("user_id", members[0]!).single()).data!.status).toBe("void");
      const rec = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `void-rec-${randomUUID()}` } as never);
      expect((rec.data as { differences_found: number }).differences_found).toBe(0);
    });

    it("rejects an unauthorized regrade", async () => {
      const e = await makeEvent("regrade-unauth", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      await settleAs(owner, e.eventId, [e.opt.get("Ava")!]);
      await drain();
      expect((await member.rpc("regrade_event", { p_event_id: e.eventId, p_resolution: "settled", p_winning_competitor_id: null, p_reason: "x", p_idempotency_key: `rgu-${randomUUID()}`, p_winning_option_ids: [e.opt.get("Ben")!] } as never)).error?.message).toContain("NOT_AUTHORIZED");
    });
  });

  // ── CONCURRENCY ─────────────────────────────────────────────────────────────
  describe("concurrency", () => {
    it("cancel vs settle race yields exactly one authoritative state", async () => {
      const e = await makeEvent("race", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
      await seedPredict(e.marketId, members[0]!, e.opt.get("Ava")!);
      await owner.rpc("lock_event", { p_event_id: e.eventId } as never);
      const [settleRes, cancelRes] = await Promise.all([
        settleAs(owner, e.eventId, [e.opt.get("Ava")!]),
        owner.rpc("cancel_event", { p_event_id: e.eventId } as never),
      ]);
      const settleOk = !settleRes.error;
      const cancelOk = !cancelRes.error && (cancelRes.data as { changed: boolean })?.changed;
      // Exactly one mutating outcome wins (the other errors or no-ops).
      const finalStatus = (await admin.from("events").select("status").eq("id", e.eventId).single()).data!.status;
      expect(["settled", "canceled"]).toContain(finalStatus);
      if (finalStatus === "settled") expect(settleOk).toBe(true);
      if (finalStatus === "canceled") expect(cancelOk).toBe(true);
      expect(settleOk && cancelOk).toBe(false); // never both
    });
  });

  // ── COMMUNITY HEALTH exclusion (EVT §18) ────────────────────────────────────
  describe("community health excludes canceled events", () => {
    it("does not count a canceled event's predictors as participation", async () => {
      // Isolated tenant — the participation metric is tenant-wide, so shared-tenant
      // predictors from other tests would pollute the count.
      const { data: t } = await admin.from("tenants").insert({ slug: `elp-${s}`, display_name: "ELP" } as never).select("id").single();
      const tp = t!.id;
      await admin.from("tenant_settings").insert({ tenant_id: tp, minimum_ranked_predictions: 1 } as never);
      const po = await createUser(`elp-o-${s}@example.test`, pw);
      users.push(po);
      await admin.from("tenant_memberships").insert({ tenant_id: tp, user_id: po, role: "creator" } as never);
      const { data: pc } = await admin.from("creators").insert({ tenant_id: tp, owner_user_id: po, display_name: "PC", slug: `pc-${s}`, verification_status: "verified" } as never).select("id").single();
      const u1 = await createUser(`elp-u1-${s}@example.test`, pw); const u2 = await createUser(`elp-u2-${s}@example.test`, pw);
      users.push(u1, u2);
      for (const u of [u1, u2]) await admin.from("tenant_memberships").insert({ tenant_id: tp, user_id: u, role: "member" } as never);

      const mkEv = async (title: string, status: string) => {
        const { data: ev } = await admin.from("events").insert({ tenant_id: tp, creator_id: pc!.id, title, slug: `${title}-${s}`, status: "open", starts_at: new Date(Date.now() - 3600_000).toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() } as never).select("id").single();
        const { data: mk } = await admin.from("markets").insert({ tenant_id: tp, event_id: ev!.id, question: "?", type: "SINGLE_CHOICE_WINNER", status: "open" } as never).select("id").single();
        const { data: o } = await admin.from("market_options").insert({ tenant_id: tp, market_id: mk!.id, competitor_id: null, label: "Yes", display_order: 0 } as never).select("id").single();
        void status;
        return { eventId: ev!.id, marketId: mk!.id, optionId: o!.id };
      };
      const live = await mkEv("plive", "open");
      const dead = await mkEv("pdead", "open");
      await admin.from("predictions").insert({ tenant_id: tp, market_id: live.marketId, user_id: u1, option_id: live.optionId, original_option_id: live.optionId, idempotency_key: `pp-${randomUUID()}`, status: "active" } as never);
      await admin.from("predictions").insert({ tenant_id: tp, market_id: dead.marketId, user_id: u2, option_id: dead.optionId, original_option_id: dead.optionId, idempotency_key: `pp-${randomUUID()}`, status: "active" } as never);
      await admin.rpc("cancel_event", { p_event_id: dead.eventId } as never); // service-role bypasses can_manage_event

      const h = (await admin.rpc("community_health_now", { p_tenant: tp } as never)).data as { components: { key: string; extra: { predictors?: number } }[] };
      const pp = h.components.find((c) => c.key === "prediction_participation");
      expect(pp?.extra.predictors).toBe(1); // u2's canceled-event prediction is excluded; only u1 counts
      await admin.from("tenants").delete().eq("id", tp);
    });

    it("treats a tenant whose only event is canceled as building-baseline", async () => {
      const { data: t } = await admin.from("tenants").insert({ slug: `elh-${s}`, display_name: "ELH" } as never).select("id").single();
      const htenant = t!.id;
      await admin.from("tenant_settings").insert({ tenant_id: htenant, minimum_ranked_predictions: 1 } as never);
      const ho = await createUser(`elh-o-${s}@example.test`, pw);
      users.push(ho);
      await admin.from("tenant_memberships").insert({ tenant_id: htenant, user_id: ho, role: "creator" } as never);
      const { data: hc } = await admin.from("creators").insert({ tenant_id: htenant, owner_user_id: ho, display_name: "HC", slug: `hc-${s}`, verification_status: "verified" } as never).select("id").single();
      const { data: ev } = await admin.from("events").insert({ tenant_id: htenant, creator_id: hc!.id, title: "solo", slug: `solo-${s}`, status: "canceled", starts_at: new Date().toISOString(), locks_at: new Date().toISOString() } as never).select("id").single();
      void ev;
      const h = (await admin.rpc("community_health_now", { p_tenant: htenant } as never)).data as { status: string };
      expect(h.status).toBe("building_baseline"); // canceled event excluded from events_total
      await admin.from("tenants").delete().eq("id", htenant);
    });
  });
});
