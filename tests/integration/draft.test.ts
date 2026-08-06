// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

d("competitor draft engine", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let compIds: string[] = [];
  const members: { id: string; client: SupabaseClient<Database> }[] = [];
  let keyN = 0;
  const key = () => `dr-${s}-${keyN++}-abcdefgh`;

  const draft = (client: SupabaseClient<Database>, competitionId: string, competitorId: string, k = key()) =>
    client.rpc("draft_competitor", { p_competition_id: competitionId, p_competitor_id: competitorId, p_idempotency_key: k } as never) as unknown as Rpc<{
      assignment_id: string; status: string; existing?: boolean; payment_required?: boolean; payment?: { amount_minor_units: number; currency_code: string };
    }>;

  const money = (n: number) => ({ amountMinorUnits: n, currencyCode: "USD" });

  const settle = (eventId: string, winner: string | null) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: winner ? "settled" : "voided", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key() } as never) as unknown as Rpc<unknown>;

  async function makeCompetition(opts: { mode?: string; access?: string; status?: string; fee?: number | null; currency?: string | null }) {
    const suf = uniqueSuffix();
    const { data: comp } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "S", slug: `s-${suf}`, status: "active" }).select("id").single();
    await admin.from("competition_draft_settings").insert({ tenant_id: tenantId, competition_id: comp!.id, is_enabled: true, mode: opts.mode ?? "exclusive", access_type: opts.access ?? "free", draft_fee_minor_units: opts.fee ?? null, currency_code: opts.currency ?? null, status: opts.status ?? "open", created_by: ownerId } as never);
    await admin.from("draft_scoring_rules").insert({ tenant_id: tenantId, competition_id: comp!.id, scoring_type: "competition_points", config: { position_points: { "1": 10, "2": 8, "3": 6 } } } as never);
    return comp!.id;
  }

  async function makeEvent(competitionId: string, competitorIds: string[]) {
    const suf = uniqueSuffix();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, competition_id: competitionId, creator_id: creatorId, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() }).select("id").single();
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "Winner?", status: "open" }).select("id").single();
    await admin.from("market_options").insert(competitorIds.map((cid, i) => ({ tenant_id: tenantId, market_id: mkt!.id, competitor_id: cid, label: `O${i}`, display_order: i })));
    return { eventId: ev!.id, marketId: mkt!.id };
  }

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `dr-${s}`, display_name: "Draft" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId });
    ownerId = await createUser(`owner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    const { data: comps } = await admin.from("competitors").insert(Array.from({ length: 8 }, (_, i) => ({ tenant_id: tenantId, creator_id: creatorId, name: `M${i}`, slug: `m-${s}-${i}` }))).select("id");
    compIds = comps!.map((x) => x.id);
    for (let i = 0; i < 5; i++) {
      const email = `m${i}-${s}@example.test`;
      const id = await createUser(email, pw);
      await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: id, role: "member" });
      members.push({ id, client: await signInAs(email, pw) });
    }
  }, 60_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    if (ownerId) await deleteUser(ownerId);
    for (const m of members) await deleteUser(m.id);
  });

  it("free exclusive: one competitor per user, exclusivity, idempotency", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "free" });
    const [u1, u2] = members;
    const k = key();
    const r1 = await draft(u1!.client, comp, compIds[0]!, k);
    expect(r1.error).toBeNull();
    expect(r1.data!.status).toBe("confirmed");

    // Same key → returns existing (idempotent).
    const again = await draft(u1!.client, comp, compIds[0]!, k);
    expect(again.data!.assignment_id).toBe(r1.data!.assignment_id);

    // A different user cannot take the same competitor (exclusive).
    const blocked = await draft(u2!.client, comp, compIds[0]!);
    expect(blocked.error?.message).toContain("COMPETITOR_UNAVAILABLE");

    // But can take a different one.
    const r2 = await draft(u2!.client, comp, compIds[1]!);
    expect(r2.error).toBeNull();

    // u1 cannot draft a second competitor.
    const second = await draft(u1!.client, comp, compIds[2]!);
    expect(second.error?.message).toContain("ALREADY_HAS_ASSIGNMENT");
  });

  it("open mode: multiple users may draft the same competitor", async () => {
    const comp = await makeCompetition({ mode: "open", access: "free" });
    const r1 = await draft(members[0]!.client, comp, compIds[0]!);
    const r2 = await draft(members[1]!.client, comp, compIds[0]!);
    expect(r1.error).toBeNull();
    expect(r2.error).toBeNull();
  });

  it("users without a draft can still make free predictions", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "free" });
    const { marketId } = await makeEvent(comp, [compIds[0]!, compIds[1]!]);
    const { data: opts } = await admin.from("market_options").select("id").eq("market_id", marketId).order("display_order");
    // members[3] never drafts, but can predict.
    const res = await members[3]!.client.rpc("submit_prediction", { p_market_id: marketId, p_option_id: opts![0]!.id, p_idempotency_key: key() });
    expect(res.error).toBeNull();
  });

  it("paid draft: reservation confirmed through the single billing pipeline (idempotent)", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "paid", fee: 500, currency: "USD" });
    // The paid-draft billing product — the SAME billing architecture as every paid feature.
    const { data: prod } = await admin
      .from("billing_products")
      .insert({ tenant_id: tenantId, product_type: "paid_competitor_draft", name: "Draft entry", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 500, billing_interval: "one_time", competition_id: comp } as never)
      .select("id").single();

    const r = await draft(members[0]!.client, comp, compIds[0]!);
    expect(r.error).toBeNull();
    expect(r.data!.status).toBe("pending_payment");
    expect(r.data!.payment!.amount_minor_units).toBe(500); // fee from server config, not client
    expect(r.data!.payment!.currency_code).toBe("USD");
    const assignmentId = r.data!.assignment_id;

    // Confirm via a verified billing webhook (apply_billing_event) — no separate pipeline.
    const orderEvent = (orderId: string) => ({
      type: "order_created",
      customData: { tenant_id: tenantId, user_id: members[0]!.id, internal_billing_product_id: (prod as { id: string }).id, draft_reservation_id: assignmentId },
      order: { providerOrderId: orderId, providerCustomerId: "cust_d", status: "paid", subtotal: money(500), tax: money(0), total: money(500), refunded: money(0), purchasedAt: new Date().toISOString() },
    });
    const confirm = await admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: orderEvent(`draft_${s}`) } as never);
    expect(confirm.error).toBeNull();
    const { data: asg } = await admin.from("competitor_draft_assignments").select("status, payment_status").eq("id", assignmentId).single();
    expect(asg!.status).toBe("confirmed");
    expect(asg!.payment_status).toBe("paid");

    // Replay the same order → idempotent, assignment stays confirmed.
    const replay = await admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: orderEvent(`draft_${s}`) } as never);
    expect(replay.error).toBeNull();
    const { data: asg2 } = await admin.from("competitor_draft_assignments").select("status").eq("id", assignmentId).single();
    expect(asg2!.status).toBe("confirmed");
  });

  it("reservations expire and release the competitor", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "paid", fee: 300, currency: "USD" });
    const r = await draft(members[0]!.client, comp, compIds[0]!);
    // Force the reservation into the past.
    await admin.from("competitor_draft_assignments").update({ reservation_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", r.data!.assignment_id);
    const expired = await admin.rpc("expire_draft_reservations", {} as never);
    expect(expired.error).toBeNull();
    const { data: asg } = await admin.from("competitor_draft_assignments").select("status").eq("id", r.data!.assignment_id).single();
    expect(asg!.status).toBe("expired");
    // Competitor is now available again.
    const retry = await draft(members[1]!.client, comp, compIds[0]!);
    expect(retry.error).toBeNull();
  });

  it("settlement updates draft standings; regrade corrects them", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "free" });
    await draft(members[0]!.client, comp, compIds[0]!); // u0 → compA
    await draft(members[1]!.client, comp, compIds[1]!); // u1 → compB
    const { eventId } = await makeEvent(comp, [compIds[0]!, compIds[1]!]);

    await settle(eventId, compIds[0]!); // compA wins → 10 pts
    let lb = (await admin.from("draft_leaderboard_snapshots").select("user_id, competition_points, rank").eq("competition_id", comp).order("rank")).data!;
    expect(lb.find((x) => x.user_id === members[0]!.id)!.competition_points).toBe(10);
    expect(lb.find((x) => x.user_id === members[1]!.id)!.competition_points).toBe(0);
    expect(lb.find((x) => x.user_id === members[0]!.id)!.rank).toBe(1);

    // Regrade: compB wins instead → standings flip.
    await admin.rpc("regrade_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: compIds[1]!, p_reason: "correction", p_idempotency_key: key() } as never);
    lb = (await admin.from("draft_leaderboard_snapshots").select("user_id, competition_points, rank").eq("competition_id", comp).order("rank")).data!;
    expect(lb.find((x) => x.user_id === members[1]!.id)!.competition_points).toBe(10);
    expect(lb.find((x) => x.user_id === members[0]!.id)!.competition_points).toBe(0);
    expect(lb.find((x) => x.user_id === members[1]!.id)!.rank).toBe(1);

    // Prize awards are idempotent.
    const { data: prize } = await admin.from("competition_prizes").insert({ tenant_id: tenantId, competition_id: comp, title: "Champion", category: "recognition", placement_from: 1, placement_to: 1, fulfillment_owner_type: "platform" } as never).select("id").single();
    const a1 = await admin.rpc("award_competition_prizes", { p_competition_id: comp } as never);
    const a2 = await admin.rpc("award_competition_prizes", { p_competition_id: comp } as never);
    expect(a1.error).toBeNull();
    const { count } = await admin.from("prize_awards").select("*", { count: "exact", head: true }).eq("competition_prize_id", prize!.id);
    expect(count).toBe(1); // awarded once despite two calls
    expect(a2.data).toBe(0); // second call adds nothing
  });

  it("draft standings are separate from the prediction leaderboard", async () => {
    // The draft leaderboard is its own table — settling never writes draft rows
    // into leaderboard_snapshots (prediction) and vice-versa.
    const { data: predLb } = await admin.from("leaderboard_snapshots").select("scope").eq("tenant_id", tenantId);
    expect((predLb ?? []).every((r) => r.scope === "global")).toBe(true);
  });

  it("concurrency: two users drafting the same exclusive competitor → exactly one wins", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "free" });
    const target = compIds[4]!;
    const [a, b] = await Promise.all([
      draft(members[0]!.client, comp, target),
      draft(members[1]!.client, comp, target),
    ]);
    const successes = [a, b].filter((r) => !r.error);
    const failures = [a, b].filter((r) => r.error);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.error!.message).toContain("COMPETITOR_UNAVAILABLE");

    const { count } = await admin
      .from("competitor_draft_assignments")
      .select("*", { count: "exact", head: true })
      .eq("competition_id", comp)
      .eq("competitor_id", target)
      .not("status", "in", "(canceled,expired)");
    expect(count).toBe(1);
  });

  it("rejects drafting when the draft is not enabled/open", async () => {
    const comp = await makeCompetition({ mode: "exclusive", access: "free", status: "draft" });
    const r = await draft(members[0]!.client, comp, compIds[0]!);
    expect(r.error?.message).toContain("DRAFT_NOT_OPEN");
  });
});
