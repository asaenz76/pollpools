// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

d("social: notifications & feed", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let u1: string;
  let follower: SupabaseClient<Database>;
  let followerId: string;
  let keyN = 0;
  const key = () => `soc-${s}-${keyN++}-abcdefgh`;

  const settle = (eventId: string, winner: string) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key() } as never) as unknown as Rpc<unknown>;

  async function makeEvent() {
    const suf = uniqueSuffix();
    const { data: comps } = await admin.from("competitors").insert([
      { tenant_id: tenantId, creator_id: creatorId, name: `A${suf}`, slug: `a-${suf}` },
      { tenant_id: tenantId, creator_id: creatorId, name: `B${suf}`, slug: `b-${suf}` },
    ]).select("id");
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, creator_id: creatorId, title: "Race", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() - 3_600_000).toISOString(), locks_at: new Date(Date.now() + 3_600_000).toISOString() }).select("id").single();
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", status: "open" }).select("id").single();
    const { data: opts } = await admin.from("market_options").insert([
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: comps![0]!.id, label: "A", display_order: 0 },
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: comps![1]!.id, label: "B", display_order: 1 },
    ]).select("id, competitor_id");
    return { eventId: ev!.id, marketId: mkt!.id, compA: comps![0]!.id, compB: comps![1]!.id, optA: opts!.find((o) => o.competitor_id === comps![0]!.id)!.id };
  }

  const notifsFor = async (userId: string, type?: string) => {
    let q = admin.from("notifications").select("id, type, dedupe_key").eq("tenant_id", tenantId).eq("user_id", userId);
    if (type) q = q.eq("type", type as never);
    return (await q).data ?? [];
  };

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `soc-${s}`, display_name: "Social" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId });
    await admin.from("achievements").insert([
      { tenant_id: tenantId, key: "first_call", name: "First Call", rule: { type: "first_prediction" } },
      { tenant_id: tenantId, key: "bullseye", name: "Bullseye", rule: { type: "first_correct" } },
    ]);
    ownerId = await createUser(`owner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    u1 = await createUser(`u1-${s}@example.test`, pw);
    followerId = await createUser(`fol-${s}@example.test`, pw);
    for (const uid of [u1, followerId]) await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uid, role: "member" });
    follower = await signInAs(`fol-${s}@example.test`, pw);
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, u1, followerId]) if (id) await deleteUser(id);
  });

  it("settlement notifies each predictor exactly once; regrade adds one corrected notice", async () => {
    const e = await makeEvent();
    await admin.from("predictions").insert({ tenant_id: tenantId, market_id: e.marketId, user_id: u1, option_id: e.optA, original_option_id: e.optA, idempotency_key: key(), status: "active" });

    await settle(e.eventId, e.compA); // u1 correct
    const afterSettle = await notifsFor(u1, "prediction_correct");
    expect(afterSettle).toHaveLength(1);

    // A settle retry does not re-fire (idempotent short-circuit).
    await settle(e.eventId, e.compA);
    expect(await notifsFor(u1, "prediction_correct")).toHaveLength(1);

    // Regrade to the other competitor → a new corrected "missed" notification.
    await admin.rpc("regrade_event", { p_event_id: e.eventId, p_resolution: "settled", p_winning_competitor_id: e.compB, p_reason: "fix", p_idempotency_key: key() } as never);
    expect(await notifsFor(u1, "prediction_incorrect")).toHaveLength(1);
  });

  it("earns an achievement notification on first correct prediction", async () => {
    // From the previous test u1 predicted; grant flows produced achievement notes.
    const earned = await notifsFor(u1, "achievement_earned");
    expect(earned.length).toBeGreaterThanOrEqual(1);
  });

  it("following a creator notifies the creator owner (once)", async () => {
    const { error } = await follower.from("creator_follows").insert({ tenant_id: tenantId, creator_id: creatorId, user_id: followerId });
    expect(error).toBeNull();
    // Duplicate follow is rejected by the unique constraint.
    const dup = await follower.from("creator_follows").insert({ tenant_id: tenantId, creator_id: creatorId, user_id: followerId });
    expect(dup.error).not.toBeNull();

    const notifs = await notifsFor(ownerId, "creator_followed");
    expect(notifs).toHaveLength(1);
  });

  it("generates feed activities for settlement and predictions", async () => {
    const { data: feed } = await admin.from("feed_activities").select("type").eq("tenant_id", tenantId);
    const types = new Set((feed ?? []).map((f) => f.type));
    expect(types.has("event_settled")).toBe(true);
    expect(types.has("user_submitted_prediction")).toBe(true);
  });

  it("a follower can only read their own notifications (RLS)", async () => {
    const { data } = await follower.from("notifications").select("user_id");
    expect((data ?? []).every((n) => n.user_id === followerId)).toBe(true);
  });
});
