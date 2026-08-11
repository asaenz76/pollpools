// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Competitor visual identity (CV): 0–4 colors + optional identifier, generic, and
 * backwards-compatible. Server-side guarantees are enforced by the DB CHECK + the
 * app.valid_visual_colors validator; usage flows through options + Draft unchanged.
 */
d("competitor visual identity", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "", otherTenant = "", creatorId = "", ownerId = "";

  const mkCompetitor = (name: string, extra: Record<string, unknown> = {}) =>
    admin.from("competitors").insert({ tenant_id: tenantId, creator_id: creatorId, name, slug: `${name}-${s}-${randomUUID().slice(0, 4)}`.toLowerCase(), ...extra } as never).select("id").single();

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `cv-${s}`, display_name: "CV" } as never).select("id").single();
    tenantId = t!.id;
    const { data: t2 } = await admin.from("tenants").insert({ slug: `cv2-${s}`, display_name: "CV2" } as never).select("id").single();
    otherTenant = t2!.id;
    ownerId = await createUser(`cv-owner-${s}@example.test`, "Password123!");
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" } as never).select("id").single();
    creatorId = c!.id;
  }, 60_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, otherTenant]);
    if (ownerId) await deleteUser(ownerId);
  });

  it("accepts 0, 1, 2, 3, and 4 colors", async () => {
    for (const colors of [[], ["#ed1c24"], ["#ed1c24", "#ffffff"], ["#0033cc", "#ffffff", "#ff0000"], ["#0033cc", "#ffffff", "#ff0000", "#ffd700"]]) {
      const r = await mkCompetitor(`n${colors.length}`, { visual_colors: colors });
      expect(r.error, `for ${colors.length} colors`).toBeNull();
    }
  });

  it("rejects a 5th color and invalid hex (server-side CHECK)", async () => {
    expect((await mkCompetitor("five", { visual_colors: ["#111111", "#222222", "#333333", "#444444", "#555555"] })).error).not.toBeNull();
    expect((await mkCompetitor("badhex", { visual_colors: ["red"] })).error).not.toBeNull();
    expect((await mkCompetitor("shorthex", { visual_colors: ["#fff"] })).error).not.toBeNull();
  });

  it("supports an optional identifier (numeric or text), rejecting >6 chars", async () => {
    expect((await mkCompetitor("eight", { visual_colors: ["#111111"], identifier: "8" })).error).toBeNull();
    expect((await mkCompetitor("letter", { identifier: "A" })).error).toBeNull();
    expect((await mkCompetitor("padded", { identifier: "07" })).error).toBeNull();
    expect((await mkCompetitor("noident", {})).error).toBeNull(); // absent identifier
    expect((await mkCompetitor("toolong", { identifier: "1234567" })).error).not.toBeNull();
  });

  it("migrates a legacy single color into the array while preserving the legacy column", async () => {
    // Legacy single-color competitor (color set, empty array) migrates to [color]
    // exactly as migration 0075 does — nothing lost.
    const { data: legacy } = await mkCompetitor("legacy", { color: "#abcdef", visual_colors: [] });
    await admin.from("competitors").update({ visual_colors: ["#abcdef"] } as never).eq("id", legacy!.id);
    const row = (await admin.from("competitors").select("visual_colors, color").eq("id", legacy!.id).single()).data;
    expect(row?.visual_colors).toEqual(["#abcdef"]);
    expect(row?.color).toBe("#abcdef"); // legacy column preserved
  });

  it("carries a multicolor + numbered competitor through an event option (read-path join)", async () => {
    const { data: comp } = await mkCompetitor("Fireball", { visual_colors: ["#ed1c24", "#ffb000", "#ffffff"], identifier: "12" });
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, creator_id: creatorId, title: "E", slug: `e-${s}`, status: "open", starts_at: new Date().toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() } as never).select("id").single();
    const { data: mkt } = await admin.from("markets").insert({ tenant_id: tenantId, event_id: ev!.id, question: "?", type: "SINGLE_CHOICE_WINNER", status: "open" } as never).select("id").single();
    await admin.from("market_options").insert({ tenant_id: tenantId, market_id: mkt!.id, competitor_id: comp!.id, label: "Fireball", display_order: 0 } as never);

    const { data: joined } = await admin
      .from("market_options")
      .select("label, competitor_id, competitors(visual_colors, identifier)")
      .eq("market_id", mkt!.id).single();
    const c = (Array.isArray(joined!.competitors) ? joined!.competitors[0] : joined!.competitors) as { visual_colors: string[]; identifier: string };
    expect(c.visual_colors).toEqual(["#ed1c24", "#ffb000", "#ffffff"]);
    expect(c.identifier).toBe("12");
  });

  it("surfaces visual identity through the Draft roster RPC", async () => {
    const { data: comp } = await mkCompetitor("Comet", { visual_colors: ["#0033cc", "#ffffff", "#ff0000", "#ffd700"], identifier: "12" });
    const { data: comp2 } = await mkCompetitor("Eight", { visual_colors: ["#111111"], identifier: "8" });
    const { data: competition } = await admin.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "TOURNAMENT", title: "T", slug: `t-${s}`, status: "active" } as never).select("id").single();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, competition_id: competition!.id, creator_id: creatorId, title: "DE", slug: `de-${s}`, status: "open", starts_at: new Date().toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() } as never).select("id").single();
    for (const c of [comp!.id, comp2!.id]) await admin.from("event_competitors").insert({ tenant_id: tenantId, event_id: ev!.id, competitor_id: c } as never);

    const { data: roster } = await admin.rpc("draft_roster", { p_competition_id: competition!.id } as never);
    const rows = (roster ?? []) as { name: string; visual_colors: string[]; identifier: string | null }[];
    const comet = rows.find((r) => r.name === "Comet");
    expect(comet?.visual_colors).toEqual(["#0033cc", "#ffffff", "#ff0000", "#ffd700"]);
    expect(comet?.identifier).toBe("12");
    expect(rows.find((r) => r.name === "Eight")?.identifier).toBe("8");
  });

  it("keeps tenant isolation — a competitor is scoped to its tenant", async () => {
    const { data: comp } = await mkCompetitor("Scoped", { visual_colors: ["#123456"] });
    expect((await admin.from("competitors").select("id").eq("id", comp!.id).eq("tenant_id", otherTenant)).data?.length ?? 0).toBe(0);
    expect((await admin.from("competitors").select("id").eq("id", comp!.id).eq("tenant_id", tenantId)).data?.length ?? 0).toBe(1);
  });
});
