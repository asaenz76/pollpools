// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 7.76 — option-based settlement. Winning market-option ids are the
 * authoritative result; the winning competitor is optional metadata derived from
 * the option. Covers competitor + non-competitor outcomes, the validation matrix,
 * idempotent regrade, bracket safety, draft non-corruption, and reconciliation.
 */
d("option-based settlement", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string, otherTenant: string;
  let creatorId: string;
  const comps: string[] = [];
  const users: string[] = [];
  let foreignOptionId: string;

  const settle = (eventId: string, winner: string | null, optionIds: string[] | null) =>
    admin.rpc("settle_event", { p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: `st-${randomUUID()}`, p_winning_option_ids: optionIds } as never);
  const drain = () => drainJobs(admin, tenantId);

  // Build an event whose market options are given as {label, competitor|null}.
  async function makeEvent(slug: string, options: { label: string; competitor: string | null }[], opts: { tenant?: string; competition?: string | null } = {}) {
    const tid = opts.tenant ?? tenantId;
    const { data: ev } = await admin.from("events").insert({ tenant_id: tid, competition_id: opts.competition ?? null, creator_id: creatorId, title: slug, slug: `${slug}-${s}`, status: "open", starts_at: new Date(Date.now() - 3600_000).toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() }).select("id").single();
    for (const c of options.filter((o) => o.competitor)) await admin.from("event_competitors").insert({ tenant_id: tid, event_id: ev!.id, competitor_id: c.competitor } as never).then(() => {}, () => {});
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tid, event_id: ev!.id, question: "Result?", type: "SINGLE_CHOICE_WINNER", status: "open" }).select("id").single();
    const { data: os } = await admin.from("market_options").insert(options.map((o, i) => ({ tenant_id: tid, market_id: mkt!.id, competitor_id: o.competitor, label: o.label, display_order: i }))).select("id, label");
    return { eventId: ev!.id, marketId: mkt!.id, opt: new Map(os!.map((o) => [o.label, o.id])) };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `os-${s}`, display_name: "OS" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId, minimum_ranked_predictions: 1 });
    const { data: t2 } = await admin.from("tenants").insert({ slug: `os2-${s}`, display_name: "OS2" }).select("id").single();
    otherTenant = t2!.id;
    await admin.from("tenant_settings").insert({ tenant_id: otherTenant, minimum_ranked_predictions: 1 });

    const owner = await createUser(`os-owner-${s}@example.test`, pw);
    users.push(owner);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: owner, role: "creator" });
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: owner, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    const { data: cr } = await admin.from("competitors").insert(["Ava", "Ben", "Cy"].map((n, i) => ({ tenant_id: tenantId, creator_id: creatorId, name: n, slug: `c-${i}-${s}` }))).select("id");
    for (const x of cr!) comps.push(x.id);
    for (let i = 0; i < 3; i++) { const u = await createUser(`os-u${i}-${s}@example.test`, pw); await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: u, role: "member" }); users.push(u); }

    // A creator + option in the OTHER tenant, to test cross-tenant rejection.
    const owner2 = await createUser(`os2-owner-${s}@example.test`, pw);
    users.push(owner2);
    const { data: c2 } = await admin.from("creators").insert({ tenant_id: otherTenant, owner_user_id: owner2, display_name: "C2", slug: `c2-${s}`, verification_status: "verified" }).select("id").single();
    const savedCreator = creatorId; creatorId = c2!.id;
    const foreign = await makeEvent("foreign", [{ label: "X", competitor: null }, { label: "Y", competitor: null }], { tenant: otherTenant });
    foreignOptionId = foreign.opt.get("X")!;
    creatorId = savedCreator;
  }, 90_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, otherTenant]);
    for (const u of users) if (u) await deleteUser(u);
  });

  const fans = () => users.slice(1, 4);

  it("settles a competitor outcome via option id (competitor derived) and via competitor id (back-compat)", async () => {
    const e = await makeEvent("comp-via-opt", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
    await predict(e.marketId, fans()[0]!, e.opt.get("Ava")!);
    expect((await settle(e.eventId, null, [e.opt.get("Ava")!])).error).toBeNull(); // option-based, no competitor param
    await drain();
    expect((await admin.from("event_results").select("winning_competitor_id").eq("event_id", e.eventId).single()).data!.winning_competitor_id).toBe(comps[0]!); // derived
    expect((await admin.from("event_result_options").select("option_id, competitor_id").eq("event_id", e.eventId).single()).data).toMatchObject({ option_id: e.opt.get("Ava"), competitor_id: comps[0] });

    const e2 = await makeEvent("comp-via-competitor", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }]);
    expect((await settle(e2.eventId, comps[1]!, null)).error).toBeNull(); // competitor-only (backward compatible)
    await drain();
    expect((await admin.from("event_result_options").select("option_id").eq("event_id", e2.eventId).single()).data!.option_id).toBe(e2.opt.get("Ben")); // resolved to Ben's option
  });

  it("settles non-competitor Yes / No outcomes with no competitor and reconciles cleanly", async () => {
    const yes = await makeEvent("yesno-1", [{ label: "Yes", competitor: null }, { label: "No", competitor: null }]);
    await predict(yes.marketId, fans()[0]!, yes.opt.get("Yes")!);
    await predict(yes.marketId, fans()[1]!, yes.opt.get("No")!);
    expect((await settle(yes.eventId, null, [yes.opt.get("Yes")!])).error).toBeNull();
    const no = await makeEvent("yesno-2", [{ label: "Yes", competitor: null }, { label: "No", competitor: null }]);
    await predict(no.marketId, fans()[2]!, no.opt.get("No")!);
    expect((await settle(no.eventId, null, [no.opt.get("No")!])).error).toBeNull();
    await drain();

    expect((await admin.from("predictions").select("status").eq("market_id", yes.marketId).eq("user_id", fans()[0]!).single()).data!.status).toBe("correct");
    expect((await admin.from("predictions").select("status").eq("market_id", no.marketId).eq("user_id", fans()[2]!).single()).data!.status).toBe("correct");
    expect((await admin.from("event_results").select("winning_competitor_id").eq("event_id", yes.eventId).single()).data!.winning_competitor_id).toBeNull();
    const rec = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `os-rec-${s}` } as never);
    expect((rec.data as { differences_found: number }).differences_found).toBe(0);
  });

  it("enforces the full server-side validation matrix", async () => {
    const e = await makeEvent("valid", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }, { label: "Draw", competitor: null }]);
    const other = await makeEvent("valid-other", [{ label: "Ono", competitor: null }]);
    const key = () => `v-${randomUUID()}`;
    const bad = (winner: string | null, options: string[] | null) =>
      admin.rpc("settle_event", { p_event_id: e.eventId, p_resolution: "settled", p_winning_competitor_id: winner, p_notes: null, p_result_url: null, p_idempotency_key: key(), p_winning_option_ids: options } as never);

    expect((await bad(null, null)).error?.message).toContain("OPTIONS_REQUIRED"); // empty
    expect((await bad(null, [other.opt.get("Ono")!])).error?.message).toContain("INVALID_WINNING_OPTION"); // another market/event
    expect((await bad(null, [foreignOptionId])).error?.message).toContain("INVALID_WINNING_OPTION"); // another tenant
    expect((await bad(null, [e.opt.get("Ava")!, e.opt.get("Ben")!])).error?.message).toContain("TOO_MANY_WINNERS"); // single-choice
    expect((await bad(comps[0]!, [e.opt.get("Ben")!])).error?.message).toContain("MISMATCHED_COMPETITOR"); // competitor≠option
    // Competitor omitted for a competitor-linked option succeeds.
    expect((await settle(e.eventId, null, [e.opt.get("Ava")!])).error).toBeNull();
  });

  it("regrade is idempotent on retry and keeps reconciliation clean", async () => {
    const e = await makeEvent("idem", [{ label: "Ava", competitor: comps[0]! }, { label: "Draw", competitor: null }]);
    await predict(e.marketId, fans()[0]!, e.opt.get("Draw")!);
    await settle(e.eventId, comps[0]!, null); await drain();
    const key = `idem-rg-${s}`;
    const r1 = await admin.rpc("regrade_event", { p_event_id: e.eventId, p_resolution: "settled", p_winning_competitor_id: null, p_reason: "d", p_idempotency_key: key, p_winning_option_ids: [e.opt.get("Draw")!] } as never);
    const r2 = await admin.rpc("regrade_event", { p_event_id: e.eventId, p_resolution: "settled", p_winning_competitor_id: null, p_reason: "d", p_idempotency_key: key, p_winning_option_ids: [e.opt.get("Draw")!] } as never);
    expect((r1.data as { grading_version: number }).grading_version).toBe((r2.data as { grading_version: number }).grading_version); // same result, no new version
    await drain();
    const versions = (await admin.from("settlements").select("grading_version").eq("event_id", e.eventId)).data ?? [];
    expect(versions.length).toBe(2); // v1 settle + v2 regrade only (retry created nothing)
    const rec = await admin.rpc("reconcile", { p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `idem-rec-${s}` } as never);
    expect((rec.data as { differences_found: number }).differences_found).toBe(0);
  });

  it("bracket: a non-competitor result is rejected; no fake competitor is created", async () => {
    const { data: comp } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "BRACKET", title: "KO", slug: `ko-${s}`, status: "active" }).select("id").single();
    const e = await makeEvent("matchup", [{ label: "Ava", competitor: comps[0]! }, { label: "Ben", competitor: comps[1]! }, { label: "Draw", competitor: null }], { competition: comp!.id });
    const { data: round } = await admin.from("bracket_rounds").insert({ tenant_id: tenantId, competition_id: comp!.id, round_number: 1, name: "Final", size: 2 } as never).select("id").single();
    await admin.from("bracket_slots").insert({ tenant_id: tenantId, competition_id: comp!.id, round_id: round!.id, match_index: 0, position: 0, event_id: e.eventId, competitor_a_id: comps[0]!, competitor_b_id: comps[1]! } as never);

    const before = (await admin.from("competitors").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId)).count;
    // A Draw cannot advance a bracket participant.
    expect((await settle(e.eventId, null, [e.opt.get("Draw")!])).error?.message).toContain("BRACKET_REQUIRES_COMPETITOR");
    // A competitor result advances the slot.
    expect((await settle(e.eventId, null, [e.opt.get("Ava")!])).error).toBeNull();
    expect((await admin.from("bracket_slots").select("winner_competitor_id, status").eq("event_id", e.eventId).single()).data).toMatchObject({ winner_competitor_id: comps[0], status: "decided" });
    // No pseudo-competitor was invented at any point.
    expect((await admin.from("competitors").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId)).count).toBe(before);
  });

  it("draft: a non-competitor result creates no draft points (no corruption)", async () => {
    const { data: comp } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "TOURNAMENT", title: "DraftComp", slug: `dc-${s}`, status: "active" }).select("id").single();
    await admin.from("competition_draft_settings").insert({ tenant_id: tenantId, competition_id: comp!.id, is_enabled: true, mode: "exclusive", access_type: "free", status: "open", created_by: users[0]! } as never);
    await admin.from("draft_scoring_rules").insert({ tenant_id: tenantId, competition_id: comp!.id, scoring_type: "competition_points", config: { position_points: { "1": 10 } } } as never);
    const e = await makeEvent("draw-in-draft", [{ label: "Ava", competitor: comps[0]! }, { label: "Draw", competitor: null }], { competition: comp!.id });
    await predict(e.marketId, fans()[0]!, e.opt.get("Draw")!);
    expect((await settle(e.eventId, null, [e.opt.get("Draw")!])).error).toBeNull();
    await drain();
    // No finishing positions recorded → no draft points from a non-competitor outcome.
    expect((await admin.from("event_competitor_results").select("*", { count: "exact", head: true }).eq("event_id", e.eventId)).count).toBe(0);
    expect((await admin.from("draft_leaderboard_snapshots").select("*", { count: "exact", head: true }).eq("competition_id", comp!.id)).count).toBe(0);
  });
});
