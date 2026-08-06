// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/**
 * Phase 7.75 — Tenant Creation Validation.
 *
 * Proves a brand-new tenant of a DIFFERENT, non-video vertical (a "Cook-off
 * Championship": chefs, no livestream) can be stood up and run end-to-end through
 * CONFIGURATION AND DATA ALONE — no code or migration changes — exercising the
 * whole generic engine: config defaults + overrides, media-optional event
 * creation (no YouTube), the predict→settle→projection lifecycle, reconciliation,
 * billing with a tenant-configured revenue split, per-tenant feature flags, engine
 * versioning, and cross-tenant isolation.
 */
d("tenant creation validation (new non-video vertical, config + data only)", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();

  let t1: string, t2: string;
  let owner1: string, owner2: string, buyer: string;
  const predictors: string[] = [];
  let ownerClient1: SupabaseClient<Database>;
  let creator1: string, creator2: string, competition1: string, support1: string;
  const chefs: string[] = [];
  let eventId: string, marketId: string;
  let winnerCompetitor: string;
  const optByCompetitor = new Map<string, string>();

  const apply = (event: Record<string, unknown>) =>
    admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: event } as never) as unknown as Rpc<unknown>;
  const money = (n: number) => ({ amountMinorUnits: n, currencyCode: "USD" });

  beforeAll(async () => {
    // ── A tenant is created from slug + display_name; settings carry only config. ──
    const { data: t } = await admin.from("tenants").insert({ slug: `cook-${s}`, display_name: "Cook-off Championship" }).select("id, engine_version").single();
    t1 = t!.id;
    // Config: a 75/25 split override + rank threshold of 1. Media columns keep defaults.
    await admin.from("tenant_settings").insert({ tenant_id: t1, minimum_ranked_predictions: 1, platform_share_bps: 2500, creator_share_bps: 7500 });

    const { data: t2row } = await admin.from("tenants").insert({ slug: `bake-${s}`, display_name: "Bake-off" }).select("id").single();
    t2 = t2row!.id;
    await admin.from("tenant_settings").insert({ tenant_id: t2, minimum_ranked_predictions: 1 });

    owner1 = await createUser(`cook-owner-${s}@example.test`, pw);
    owner2 = await createUser(`bake-owner-${s}@example.test`, pw);
    buyer = await createUser(`cook-buyer-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert([
      { tenant_id: t1, user_id: owner1, role: "creator" },
      { tenant_id: t2, user_id: owner2, role: "creator" },
      { tenant_id: t1, user_id: buyer, role: "member" },
    ]);

    const c1 = await admin.from("creators").insert({ tenant_id: t1, owner_user_id: owner1, display_name: "Chef Guild", slug: `guild-${s}`, verification_status: "verified" }).select("id").single();
    creator1 = c1.data!.id;
    const c2 = await admin.from("creators").insert({ tenant_id: t2, owner_user_id: owner2, display_name: "Bakers", slug: `bakers-${s}`, verification_status: "verified" }).select("id").single();
    creator2 = c2.data!.id;

    // Generic competitors — chefs, no vertical assumption in shared code.
    const { data: comps } = await admin.from("competitors").insert(
      ["Ramsay", "Bourdain", "Child", "Andrés"].map((name, i) => ({ tenant_id: t1, creator_id: creator1, name, slug: `chef-${i}-${s}` })),
    ).select("id, name");
    for (const c of comps!) chefs.push(c.id);

    const comp = await admin.from("competitions").insert({ tenant_id: t1, creator_id: creator1, type: "TOURNAMENT", title: "Golden Ladle", slug: `ladle-${s}`, status: "active" }).select("id").single();
    competition1 = comp.data!.id;

    // A creator-support product for the billing-split check.
    const p1 = await admin.from("billing_products").insert({ tenant_id: t1, product_type: "creator_support", name: "Support the Guild", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 500, billing_interval: "monthly", creator_id: creator1 }).select("id").single();
    support1 = p1.data!.id;

    for (let i = 0; i < 4; i++) {
      const u = await createUser(`cook-fan-${i}-${s}@example.test`, pw);
      await admin.from("tenant_memberships").insert({ tenant_id: t1, user_id: u, role: "member" });
      predictors.push(u);
    }

    // ── The creator publishes an event through the generic RPC with NO media. ──
    ownerClient1 = await signInAs(`cook-owner-${s}@example.test`, pw);
    const { data: created, error: createErr } = await (ownerClient1.rpc("create_event_with_market", {
      p_creator_id: creator1, p_competition_id: competition1, p_title: "Cook-off Round 1", p_slug: `round-1-${s}`,
      p_description: "Four chefs, one dish.", p_starts_at: null, p_locks_at: null,
      p_competitor_ids: chefs, p_market_question: "Which chef will win?", p_publish: true, p_media: [],
    } as never) as unknown as Rpc<{ event_id: string }>);
    expect(createErr).toBeNull();
    eventId = created!.event_id;

    const mk = await admin.from("markets").select("id").eq("event_id", eventId).single();
    marketId = mk.data!.id;
    const { data: opts } = await admin.from("market_options").select("id, competitor_id").eq("market_id", marketId);
    for (const o of opts!) if (o.competitor_id) optByCompetitor.set(o.competitor_id, o.id);
    winnerCompetitor = chefs[0]!;

    // A second-tenant event, to prove isolation.
    const { data: e2 } = await admin.from("events").insert({ tenant_id: t2, creator_id: creator2, title: "Bake Round 1", slug: `bake-r1-${s}`, status: "open", starts_at: new Date(Date.now() - 3600_000).toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() }).select("id").single();
    void e2;
  }, 90_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [t1, t2]);
    for (const u of [owner1, owner2, buyer, ...predictors]) if (u) await deleteUser(u);
  });

  it("creates a tenant from slug + display_name alone, with generic engine defaults", async () => {
    const { data: t } = await admin.from("tenants").select("engine_version").eq("id", t1).single();
    expect(t!.engine_version).toBe("1.0"); // pinned default, never 'latest'
    const { data: st } = await admin.from("tenant_settings").select("event_media_enabled, event_media_optional, external_media_links_enabled, preferred_media_provider").eq("tenant_id", t1).single();
    expect(st).toMatchObject({ event_media_enabled: true, event_media_optional: true, external_media_links_enabled: true, preferred_media_provider: null });
  });

  it("publishes an event with NO media — no video/YouTube dependency for a non-video vertical", async () => {
    const { data: ev } = await admin.from("events").select("status").eq("id", eventId).single();
    expect(ev!.status).toBe("open");
    const { count: media } = await admin.from("event_media_links").select("*", { count: "exact", head: true }).eq("event_id", eventId);
    expect(media).toBe(0); // generic creation needs no media
    const { data: options } = await admin.from("market_options").select("label").eq("market_id", marketId);
    expect(options!.map((o) => o.label).sort()).toEqual(["Andrés", "Bourdain", "Child", "Ramsay"]); // labels come from data, not code
  });

  it("runs the full predict → settle → projection lifecycle generically", async () => {
    // Two fans back the winner, two back others.
    const picks = [winnerCompetitor, winnerCompetitor, chefs[1]!, chefs[2]!];
    for (let i = 0; i < predictors.length; i++) {
      const optionId = optByCompetitor.get(picks[i]!)!;
      await admin.from("predictions").insert({ tenant_id: t1, market_id: marketId, user_id: predictors[i]!, option_id: optionId, original_option_id: optionId, idempotency_key: `pred-${i}-${s}`, status: "active" } as never);
    }
    const settle = await admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winnerCompetitor, p_notes: null, p_result_url: null, p_idempotency_key: `settle-${s}`, p_winning_option_ids: null } as never);
    expect(settle.error).toBeNull();
    await drainJobs(admin, t1);

    // Winner-pickers earned points; stats + global leaderboard populated for this tenant.
    const { data: stats } = await admin.from("user_statistics").select("user_id, total_points, correct_predictions").eq("tenant_id", t1);
    expect((stats ?? []).length).toBeGreaterThanOrEqual(4);
    const winners = (stats ?? []).filter((r) => r.correct_predictions > 0);
    expect(winners.length).toBe(2);
    const { count: lb } = await admin.from("leaderboard_snapshots").select("*", { count: "exact", head: true }).eq("tenant_id", t1).eq("scope", "global");
    expect(lb).toBeGreaterThanOrEqual(1);
  });

  it("reconciliation confirms the async projections equal the canonical rebuild", async () => {
    const r = await admin.rpc("reconcile", { p_tenant: t1, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `tcv-${s}` } as never);
    expect(r.error).toBeNull();
    expect((r.data as { differences_found: number }).differences_found).toBe(0);
  });

  it("honors the tenant's configured revenue split (75/25) on billing", async () => {
    await apply({
      type: "order_created",
      customData: { tenant_id: t1, user_id: buyer, internal_billing_product_id: support1, creator_id: creator1 },
      order: { providerOrderId: `cook-ord-${s}`, providerCustomerId: "c", status: "paid", subtotal: money(500), tax: money(0), total: money(500), refunded: money(0), purchasedAt: new Date().toISOString() },
    });
    const oid = (await admin.from("billing_orders").select("id").eq("provider_order_id", `cook-ord-${s}`).single()).data!.id;
    const earning = (await admin.from("creator_earnings").select("creator_share_minor_units, platform_share_minor_units").eq("billing_order_id", oid).single()).data!;
    expect(earning).toMatchObject({ creator_share_minor_units: 375, platform_share_minor_units: 125 }); // 500 @ 75/25 config
  });

  it("supports per-tenant feature-flag configuration", async () => {
    await admin.from("tenant_feature_flags").insert({ tenant_id: t1, flag: "comments_enabled", enabled: false } as never);
    const { data } = await admin.from("tenant_feature_flags").select("enabled").eq("tenant_id", t1).eq("flag", "comments_enabled").single();
    expect(data!.enabled).toBe(false); // configurable without code
  });

  it("keeps the new tenant fully isolated from another tenant", async () => {
    const { data: t1events } = await admin.from("events").select("id").eq("tenant_id", t1);
    const { data: t2events } = await admin.from("events").select("id").eq("tenant_id", t2);
    const t1ids = new Set((t1events ?? []).map((e) => e.id));
    for (const e of t2events ?? []) expect(t1ids.has(e.id)).toBe(false);
    // T2 has no stats/leaderboard from T1's settlement.
    const { count: t2stats } = await admin.from("user_statistics").select("*", { count: "exact", head: true }).eq("tenant_id", t2);
    expect(t2stats).toBe(0);
  });

  it("pins an explicit engine version and rejects 'latest'", async () => {
    const bad = await admin.from("tenants").update({ engine_version: "latest" }).eq("id", t1);
    expect(bad.error).not.toBeNull(); // check constraint rejects non-numeric versions
    const ok = await admin.from("tenants").update({ engine_version: "1.0" }).eq("id", t1);
    expect(ok.error).toBeNull();
  });
});
