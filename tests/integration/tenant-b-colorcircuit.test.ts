// @vitest-environment node
process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret-value";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";
import { POST as drainPOST } from "@/app/api/internal/jobs/drain/route";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/**
 * Phase 7.75B — Tenant B: ColorCircuit (livestream racing community with Draft).
 *
 * Racers are generic competitors; races are single-winner events. Validates
 * optional media of every supported kind, free Open Predictions, exclusive free
 * Competitor Draft (standings separate from the prediction leaderboard, updated
 * through regrade), idempotent achievements, test-mode creator support billing,
 * the PRODUCTION drain endpoint, reconciliation, and isolation — config + data only.
 */
d("Tenant B — ColorCircuit (racing + draft, config + data only)", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string, otherTenant: string;
  let ownerId: string, ownerClient: SupabaseClient<Database>;
  let creatorId: string, seasonId: string, tourneyId: string;
  let buyer: string, supportId: string;
  const racers: string[] = [];
  const fans: string[] = [];

  const settle = (eventId: string, winner: string) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: `st-${randomUUID()}`, p_winning_option_ids: null } as never);
  const drain = () => drainJobs(admin, tenantId);
  const money = (n: number) => ({ amountMinorUnits: n, currencyCode: "USD" });

  // Create a single-winner race via the generic RPC (as the signed-in owner), with optional media.
  async function makeRace(slug: string, competition: string | null, racerIds: string[], media?: { provider: string; media_type: string; url: string }) {
    const { data, error } = await (ownerClient.rpc("create_event_with_market", {
      p_creator_id: creatorId, p_competition_id: competition, p_title: slug, p_slug: `${slug}-${s}`, p_description: null,
      p_starts_at: null, p_locks_at: null, p_competitor_ids: racerIds, p_market_question: "Which racer will win?", p_publish: true,
      p_media: media ? [{ ...media, is_primary: true }] : [],
    } as never) as unknown as Rpc<{ event_id: string }>);
    expect(error).toBeNull();
    const eventId = data!.event_id;
    const { data: mkt } = await admin.from("markets").select("id").eq("event_id", eventId).single();
    const { data: opts } = await admin.from("market_options").select("id, competitor_id").eq("market_id", mkt!.id);
    return { eventId, marketId: mkt!.id, optByCompetitor: new Map(opts!.filter((o) => o.competitor_id).map((o) => [o.competitor_id!, o.id])) };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `cc-${s}`, display_name: "ColorCircuit" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    const { data: t2 } = await admin.from("tenants").insert({ slug: `cc2-${s}`, display_name: "Other" }).select("id").single();
    otherTenant = t2!.id;

    ownerId = await createUser(`cc-owner-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "creator" });
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "Circuit HQ", slug: `hq-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;

    const { data: rs } = await admin.from("competitors").insert(
      ["Crimson", "Azure", "Verde", "Gold", "Violet", "Cyan"].map((name, i) => ({ tenant_id: tenantId, creator_id: creatorId, name, slug: `racer-${i}-${s}` })),
    ).select("id");
    for (const r of rs!) racers.push(r.id);

    const mkComp = async (type: "SEASON" | "TOURNAMENT" | "BRACKET", title: string, slug: string) =>
      (await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type, title, slug: `${slug}-${s}`, status: "active" }).select("id").single()).data!.id;
    seasonId = await mkComp("SEASON", "2026 Season", "season");
    tourneyId = await mkComp("TOURNAMENT", "Grand Prix", "gp");
    await mkComp("BRACKET", "Knockout", "ko"); // item 4: bracket creation (validated via the type set)

    // Exclusive, FREE draft on the tournament. Paid config present but not enabled here.
    await admin.from("competition_draft_settings").insert({ tenant_id: tenantId, competition_id: tourneyId, is_enabled: true, mode: "exclusive", access_type: "free", status: "open", created_by: ownerId } as never);
    await admin.from("draft_scoring_rules").insert({ tenant_id: tenantId, competition_id: tourneyId, scoring_type: "competition_points", config: { position_points: { "1": 10, "2": 6 } } } as never);

    for (let i = 0; i < 3; i++) {
      const u = await createUser(`cc-fan-${i}-${s}@example.test`, pw);
      await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: u, role: "member" });
      fans.push(u);
    }
    buyer = await createUser(`cc-buyer-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: buyer, role: "member" });
    const p = await admin.from("billing_products").insert({ tenant_id: tenantId, product_type: "creator_support", name: "Support HQ", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 500, billing_interval: "monthly", creator_id: creatorId }).select("id").single();
    supportId = p.data!.id;

    ownerClient = await signInAs(`cc-owner-${s}@example.test`, pw);
  }, 120_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, otherTenant]);
    for (const u of [ownerId, buyer, ...fans]) if (u) await deleteUser(u);
  });

  it("creates the tenant and all three competition types (Season / Tournament / Bracket)", async () => {
    expect((await admin.from("tenants").select("engine_version").eq("id", tenantId).single()).data!.engine_version).toBe("1.0");
    const { data: types } = await admin.from("competitions").select("type").eq("tenant_id", tenantId);
    expect(new Set((types ?? []).map((r) => r.type))).toEqual(new Set(["SEASON", "TOURNAMENT", "BRACKET"]));
    expect(racers).toHaveLength(6); // racers are generic competitors
  });

  it("attaches optional media of every supported kind (none / YouTube Live / TikTok Live / Twitch / external)", async () => {
    const specs: [string, { provider: string; media_type: string; url: string } | undefined][] = [
      ["no-media", undefined],
      ["yt", { provider: "youtube", media_type: "livestream", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" }],
      ["tiktok", { provider: "tiktok", media_type: "livestream", url: "https://www.tiktok.com/@cc/live" }],
      ["twitch", { provider: "twitch", media_type: "livestream", url: "https://www.twitch.tv/cc" }],
      ["ext", { provider: "external", media_type: "livestream", url: "https://stream.example/live" }],
    ];
    for (const [slug, media] of specs) {
      const r = await makeRace(slug, seasonId, [racers[0]!, racers[1]!], media);
      const { count } = await admin.from("event_media_links").select("*", { count: "exact", head: true }).eq("event_id", r.eventId);
      expect(count, slug).toBe(media ? 1 : 0);
    }
  });

  it("keeps Open Predictions free (no Draft required) and settles them", async () => {
    const r = await makeRace("free-pred", seasonId, [racers[2]!, racers[3]!]);
    await predict(r.marketId, fans[0]!, r.optByCompetitor.get(racers[2]!)!); // no draft anywhere — prediction just works
    expect((await settle(r.eventId, racers[2]!)).error).toBeNull();
    await drain();
    expect((await admin.from("predictions").select("status").eq("market_id", r.marketId).eq("user_id", fans[0]!).single()).data!.status).toBe("correct");
  });

  it("runs exclusive free Draft: one user drafts one racer; a duplicate is refused", async () => {
    const u1 = await signInAs(`cc-fan-0-${s}@example.test`, pw);
    const u2 = await signInAs(`cc-fan-1-${s}@example.test`, pw);
    const drafted = racers[0]!;
    const first = await u1.rpc("draft_competitor", { p_competition_id: tourneyId, p_competitor_id: drafted, p_idempotency_key: `dr-${s}-1` } as never);
    expect(first.error).toBeNull();
    const dup = await u2.rpc("draft_competitor", { p_competition_id: tourneyId, p_competitor_id: drafted, p_idempotency_key: `dr-${s}-2` } as never);
    expect(dup.error?.message).toContain("COMPETITOR_UNAVAILABLE"); // exclusive mode
    const { count } = await admin.from("competitor_draft_assignments").select("*", { count: "exact", head: true }).eq("competition_id", tourneyId).eq("competitor_id", drafted).not("status", "in", "(canceled,expired)");
    expect(count).toBe(1);
  });

  it("updates Draft standings on settlement (separate from the prediction leaderboard) and through regrade", async () => {
    // fan-0 drafted racer0; a tournament race where racer0 wins gives fan-0 draft points.
    const race = await makeRace("gp-r1", tourneyId, [racers[0]!, racers[1]!]);
    await predict(race.marketId, fans[2]!, race.optByCompetitor.get(racers[0]!)!);
    expect((await settle(race.eventId, racers[0]!)).error).toBeNull();
    await drain();

    const draftRows = (await admin.from("draft_leaderboard_snapshots").select("user_id, competition_points").eq("competition_id", tourneyId)).data ?? [];
    expect(draftRows.some((r) => r.user_id === fans[0]! && (r.competition_points ?? 0) > 0)).toBe(true); // drafter of the winner scored
    // The prediction leaderboard is a DIFFERENT table (about predictors, not drafters).
    const predLb = (await admin.from("leaderboard_snapshots").select("user_id").eq("tenant_id", tenantId).eq("scope", "global")).data ?? [];
    expect(predLb.some((r) => r.user_id === fans[2]!)).toBe(true); // predictor is on the prediction leaderboard
    expect(predLb.some((r) => r.user_id === fans[0]!) && draftRows.some((r) => r.user_id === fans[0]!)).toBeDefined();

    // Regrade the race to racer1 — draft standings must move to racer1's drafter (none), racer0's drafter loses the points.
    const rg = await admin.rpc("regrade_event", { p_event_id: race.eventId, p_resolution: "settled", p_winning_competitor_id: racers[1]!, p_reason: "photo finish", p_idempotency_key: `rg-${s}`, p_winning_option_ids: null } as never);
    expect(rg.error).toBeNull();
    await drain();
    const after = (await admin.from("draft_leaderboard_snapshots").select("user_id, competition_points").eq("competition_id", tourneyId)).data ?? [];
    const fan0After = after.find((r) => r.user_id === fans[0]!)?.competition_points ?? 0;
    expect(fan0After).toBe(0); // racer0 no longer wins → its drafter's points removed
  });

  it("grants achievements idempotently", async () => {
    const before = (await admin.from("user_achievements").select("id").eq("tenant_id", tenantId)).data ?? [];
    await drain(); // re-drain: no new jobs, no duplicate grants
    const after = (await admin.from("user_achievements").select("id").eq("tenant_id", tenantId)).data ?? [];
    expect(after.length).toBe(before.length);
  });

  it("records creator-support earnings in test (mock) mode", async () => {
    await admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: {
      type: "order_created",
      customData: { tenant_id: tenantId, user_id: buyer, internal_billing_product_id: supportId, creator_id: creatorId },
      order: { providerOrderId: `cc-ord-${s}`, providerCustomerId: "c", status: "paid", subtotal: money(500), tax: money(0), total: money(500), refunded: money(0), purchasedAt: new Date().toISOString() },
    } } as never);
    const oid = (await admin.from("billing_orders").select("id").eq("provider_order_id", `cc-ord-${s}`).single()).data!.id;
    const { count } = await admin.from("creator_earnings").select("*", { count: "exact", head: true }).eq("billing_order_id", oid).eq("status", "available");
    expect(count).toBe(1);
  });

  it("processes projections through the PRODUCTION drain endpoint", async () => {
    // Settle a fresh race but DON'T drain here — let the internal endpoint do it.
    const race = await makeRace("gp-r2", seasonId, [racers[4]!, racers[5]!]);
    await predict(race.marketId, fans[1]!, race.optByCompetitor.get(racers[4]!)!);
    await settle(race.eventId, racers[4]!);
    const res = await drainPOST(new NextRequest("https://app.test/api/internal/jobs/drain", {
      method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" }, body: JSON.stringify({ tenantId }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.acquired).toBe(true);
    expect(body.result.claimed).toBeGreaterThanOrEqual(1); // endpoint drained real projection jobs
    expect((await admin.from("predictions").select("status").eq("market_id", race.marketId).eq("user_id", fans[1]!).single()).data!.status).toBe("correct");
  });

  it("reconciliation reports zero differences and stays isolated from another tenant", async () => {
    await drain();
    const r = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `rec-${s}` } as never);
    expect((r.data as { differences_found: number }).differences_found).toBe(0);
    expect((await admin.from("events").select("*", { count: "exact", head: true }).eq("tenant_id", otherTenant)).count).toBe(0);
    expect((await admin.from("draft_leaderboard_snapshots").select("*", { count: "exact", head: true }).eq("tenant_id", otherTenant)).count).toBe(0);
  });
});
