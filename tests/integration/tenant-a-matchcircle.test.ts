// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 7.75B — Tenant A: MatchCircle (sports-style club community).
 *
 * Validates a three-way Home / Draw / Away market vertical built from DATA + CONFIG
 * only. Clubs are generic competitors; matches are generic events; the three-way
 * market is composed from generic options (two competitor-backed, one — "Draw" —
 * with NO competitor). Competitor-outcome settlement (home/away) is validated end
 * to end. The DRAW outcome exposes an architecture leak (settle_event mandates a
 * winning competitor) — validated as a rejection and reported, NOT worked around.
 */
d("Tenant A — MatchCircle (three-way sports market, config + data only)", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string, otherTenant: string;
  let ownerId: string, creatorId: string, leagueId: string;
  const clubs: string[] = [];
  const fans: string[] = [];

  const settle = (eventId: string, winner: string | null, optionIds: string[] | null = null) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: `st-${randomUUID()}`, p_winning_option_ids: optionIds } as never);
  const drain = () => drainJobs(admin, tenantId);

  /** Build a Home/Draw/Away match: options[0]=home(clubA), [1]=Draw(no competitor), [2]=away(clubB). */
  async function makeMatch(slug: string, home: string, away: string, opts: { media?: boolean } = {}) {
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, competition_id: leagueId, creator_id: creatorId, title: slug, slug: `${slug}-${s}`, status: "open", starts_at: new Date(Date.now() - 3600_000).toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() }).select("id").single();
    const eventId = ev!.id;
    for (const c of [home, away]) await admin.from("event_competitors").insert({ tenant_id: tenantId, event_id: eventId, competitor_id: c } as never);
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: eventId, question: "Match result?", type: "SINGLE_CHOICE_WINNER", status: "open" }).select("id").single();
    const { data: opts2 } = await admin.from("market_options").insert([
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: home, label: "Home win", display_order: 0 },
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: null, label: "Draw", display_order: 1 },
      { tenant_id: tenantId, market_id: mkt!.id, competitor_id: away, label: "Away win", display_order: 2 },
    ]).select("id, label");
    if (opts.media) await admin.from("event_media_links").insert({ tenant_id: tenantId, event_id: eventId, provider: "external", media_type: "livestream", url: "https://sports.example/live", is_primary: true, label: "Watch the match" } as never);
    const byLabel = new Map(opts2!.map((o) => [o.label, o.id]));
    return { eventId, marketId: mkt!.id, home: byLabel.get("Home win")!, draw: byLabel.get("Draw")!, away: byLabel.get("Away win")! };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `mc-${s}`, display_name: "MatchCircle" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    const { data: t2 } = await admin.from("tenants").insert({ slug: `mc2-${s}`, display_name: "Other" }).select("id").single();
    otherTenant = t2!.id;

    ownerId = await createUser(`mc-owner-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "creator" });
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "League Office", slug: `lo-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;

    const { data: comps } = await admin.from("competitors").insert(
      ["Arsenal", "Chelsea", "Spurs", "City"].map((name, i) => ({ tenant_id: tenantId, creator_id: creatorId, name, slug: `club-${i}-${s}` })),
    ).select("id");
    for (const x of comps!) clubs.push(x.id);

    // League (SEASON) and Tournament competitions.
    const { data: lg } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "Premier League", slug: `pl-${s}`, status: "active" }).select("id").single();
    leagueId = lg!.id;
    await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "TOURNAMENT", title: "FA Cup", slug: `fac-${s}`, status: "active" }); // item 3: tournament creation (validated via the type set)

    for (let i = 0; i < 3; i++) {
      const u = await createUser(`mc-fan-${i}-${s}@example.test`, pw);
      await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: u, role: "member" });
      fans.push(u);
    }
  }, 90_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, otherTenant]);
    for (const u of [ownerId, ...fans]) if (u) await deleteUser(u);
  });

  it("creates the tenant and both competition types (League + Tournament) from config", async () => {
    const { data: t } = await admin.from("tenants").select("engine_version").eq("id", tenantId).single();
    expect(t!.engine_version).toBe("1.0"); // explicitly pinned
    const { data: types } = await admin.from("competitions").select("type").eq("tenant_id", tenantId).order("type");
    expect(new Set((types ?? []).map((r) => r.type))).toEqual(new Set(["SEASON", "TOURNAMENT"]));
    expect(clubs).toHaveLength(4); // clubs are generic competitors
  });

  it("composes a three-way market, takes predictions on all three options, and computes sentiment", async () => {
    const m = await makeMatch("home-derby", clubs[0]!, clubs[1]!);
    await predict(m.marketId, fans[0]!, m.home);
    await predict(m.marketId, fans[1]!, m.draw);
    await predict(m.marketId, fans[2]!, m.away);
    const { data: sentiment } = await admin.rpc("market_sentiment", { p_market_id: m.marketId } as never);
    expect((sentiment ?? []).length).toBe(3); // Home / Draw / Away all present
    expect((sentiment ?? []).reduce((n, r) => n + Number(r.votes), 0)).toBe(3);
  });

  it("settles a HOME win and an AWAY win (competitor outcomes) and regrades between them", async () => {
    // Home win.
    const hm = await makeMatch("home-win", clubs[0]!, clubs[1]!);
    await predict(hm.marketId, fans[0]!, hm.home);
    await predict(hm.marketId, fans[1]!, hm.away);
    expect((await settle(hm.eventId, clubs[0]!)).error).toBeNull();
    await drain();
    expect((await admin.from("predictions").select("status").eq("market_id", hm.marketId).eq("user_id", fans[0]!).single()).data!.status).toBe("correct");

    // Away win (separate match).
    const aw = await makeMatch("away-win", clubs[2]!, clubs[3]!);
    await predict(aw.marketId, fans[0]!, aw.away);
    expect((await settle(aw.eventId, clubs[3]!)).error).toBeNull();
    await drain();
    expect((await admin.from("predictions").select("status").eq("market_id", aw.marketId).eq("user_id", fans[0]!).single()).data!.status).toBe("correct");

    // Regrade the home-win match to an away win — the competitor outcome flips.
    const rg = await admin.rpc("regrade_event", { p_event_id: hm.eventId, p_resolution: "settled", p_winning_competitor_id: clubs[1]!, p_reason: "correction", p_idempotency_key: `rg-${s}`, p_winning_option_ids: null } as never);
    expect(rg.error).toBeNull();
    await drain();
    expect((await admin.from("predictions").select("status").eq("market_id", hm.marketId).eq("user_id", fans[1]!).single()).data!.status).toBe("correct"); // away backer now correct
  });

  it("ARCHITECTURE LEAK: a DRAW outcome (no competitor) cannot be settled by the existing engine", async () => {
    const dm = await makeMatch("draw-fixture", clubs[0]!, clubs[1]!);
    await predict(dm.marketId, fans[0]!, dm.draw);
    // There is no competitor for "Draw"; settle_event mandates a winning competitor.
    const nullWinner = await settle(dm.eventId, null, [dm.draw]);
    expect(nullWinner.error?.message).toContain("WINNER_REQUIRED"); // <-- the leak: outcome must be a competitor
    // The prediction on Draw stays ungraded (event unsettled) — never silently mis-resolved.
    expect((await admin.from("predictions").select("status").eq("market_id", dm.marketId).eq("user_id", fans[0]!).single()).data!.status).toBe("active");
  });

  it("populates statistics, streaks, and global / competition / creator leaderboards", async () => {
    const { data: stats } = await admin.from("user_statistics").select("user_id, total_points, current_streak").eq("tenant_id", tenantId);
    expect((stats ?? []).some((r) => r.total_points > 0)).toBe(true);
    // The league is a SEASON competition, so its competition leaderboard is the
    // 'season' scope; global + creator also populate from the settlement path.
    for (const scope of ["global", "creator", "season"] as const) {
      const { count } = await admin.from("leaderboard_snapshots").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("scope", scope);
      expect(count, `scope ${scope} should have rows`).toBeGreaterThanOrEqual(1);
    }
  });

  it("emits settlement notifications and feed activity", async () => {
    const { count: notifs } = await admin.from("notifications").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
    expect(notifs).toBeGreaterThanOrEqual(1);
    const { count: feed } = await admin.from("feed_activities").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
    expect(feed).toBeGreaterThanOrEqual(1);
  });

  it("supports events with no media and with an optional generic livestream link", async () => {
    const noMedia = await makeMatch("no-media", clubs[0]!, clubs[2]!);
    expect((await admin.from("event_media_links").select("*", { count: "exact", head: true }).eq("event_id", noMedia.eventId)).count).toBe(0);
    const withMedia = await makeMatch("with-media", clubs[1]!, clubs[3]!, { media: true });
    const { data: media } = await admin.from("event_media_links").select("provider, media_type").eq("event_id", withMedia.eventId).single();
    expect(media).toMatchObject({ provider: "external", media_type: "livestream" }); // generic external link, no YouTube requirement
  });

  it("reconciliation reports zero differences and stays isolated from another tenant", async () => {
    await drain();
    const r = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `rec-${s}` } as never);
    expect((r.data as { differences_found: number }).differences_found).toBe(0);
    const { count: otherStats } = await admin.from("user_statistics").select("*", { count: "exact", head: true }).eq("tenant_id", otherTenant);
    expect(otherStats).toBe(0);
  });
});
