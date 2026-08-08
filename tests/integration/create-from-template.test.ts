// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, anonClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = { data: T | null; error: { message: string } | null };

/**
 * Phase 8-D 8D.2 — create_tenant_from_template is transactional and maps a
 * template onto the existing tenant systems. A failure creates no partial tenant
 * and no orphan assignment; only the Super Admin / service role may call it.
 */
d("create_tenant_from_template (8D.2)", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let owner = "";
  let goodVersion = "";
  let badVersion = "";
  let retiredVersion = "";
  let draftVersion = "";
  const createdSlugs: string[] = [];

  const config = {
    locale: "en", timezone: "UTC",
    vocabulary: { competitor: { singular: "Racer", plural: "Racers" } },
    theme: { brandPrimary: "#123456" },
    settings: { minimumRankedPredictions: 3, showPoweredBy: true },
    providers: { result: "manual", event: "manual", notification: ["in_app"] },
    featureFlags: { predictions_enabled: true, global_leaderboard_enabled: true, creator_support_enabled: false },
    enabledCompetitionTypes: ["SEASON", "STANDALONE_EVENT"],
    competitionDefaults: { draftEnabled: true },
    marketTemplates: [{ type: "SINGLE_CHOICE_WINNER", question: "Which racer will win?" }],
  };
  const seed = { creator: { displayName: "Demo League" }, competitors: ["A", "B", "C"], competition: { type: "SEASON", title: "Season 1" }, event: { title: "Race 1" } };

  async function publishVersion(key: string, version: number, cfg: unknown, seedDef: unknown, status = "published", published = true) {
    const { data: t } = await admin.from("tenant_templates").insert({ key: `${key}-${s}`, name: key, category: "racing", status, latest_version: version } as never).select("id").single();
    const { data: v } = await admin.from("tenant_template_versions").insert({
      template_id: t!.id, version, engine_version: "1.0", configuration: cfg as never, seed_definition: seedDef as never,
      published_at: published ? new Date().toISOString() : null,
    } as never).select("id").single();
    return v!.id as string;
  }

  const create = (versionId: string, slug: string, overrides: unknown = {}, demo = false) =>
    admin.rpc("create_tenant_from_template" as never, {
      p_template_version_id: versionId, p_identity: { slug, display_name: slug }, p_overrides: overrides, p_include_demo: demo, p_demo_owner: owner,
    } as never) as unknown as Promise<Rpc<{ tenant_id: string; slug: string }>>;

  beforeAll(async () => {
    owner = await createUser(`tmpl-${s}@t.test`, "Password123!");
    goodVersion = await publishVersion("racing", 1, config, seed);
    badVersion = await publishVersion("racing-bad", 1, config, { ...seed, competition: { type: "NOT_A_TYPE", title: "X" } });
    retiredVersion = await publishVersion("racing-retired", 1, config, null, "retired");
    draftVersion = await publishVersion("racing-draft", 1, config, null, "draft", false);
  });

  afterAll(async () => {
    for (const slug of createdSlugs) await admin.from("tenants").delete().eq("slug", slug);
    await admin.from("tenant_templates").delete().like("key", `%-${s}`);
    if (owner) await deleteUser(owner);
  });

  it("creates a tenant mapped onto the existing systems (empty)", async () => {
    const slug = `mt-empty-${s}`;
    createdSlugs.push(slug);
    const { data, error } = await create(goodVersion, slug);
    expect(error).toBeNull();
    expect(data!.slug).toBe(slug);

    const { data: tenant } = await admin.from("tenants").select("id, engine_version, template_id, template_version").eq("slug", slug).single();
    expect(tenant!.template_id).not.toBeNull();
    expect(tenant!.engine_version).toBe("1.0");
    const { data: settings } = await admin.from("tenant_settings").select("vocabulary, minimum_ranked_predictions, providers").eq("tenant_id", tenant!.id).single();
    expect((settings!.vocabulary as { competitor: { singular: string } }).competitor.singular).toBe("Racer");
    expect(settings!.minimum_ranked_predictions).toBe(3);
    const { data: flags } = await admin.from("tenant_feature_flags").select("flag, enabled").eq("tenant_id", tenant!.id);
    expect(flags!.find((f) => f.flag === "predictions_enabled")!.enabled).toBe(true);
    // Immutable assignment snapshot recorded.
    const { data: asg } = await admin.from("tenant_template_assignments").select("template_version, snapshot").eq("tenant_id", tenant!.id).single();
    expect(asg!.template_version).toBe(1);
    expect((asg!.snapshot as { template_key: string }).template_key).toContain("racing");
  });

  it("optionally seeds demo data (creator, competitors, event, market, options)", async () => {
    const slug = `mt-demo-${s}`;
    createdSlugs.push(slug);
    const { error } = await create(goodVersion, slug, {}, true);
    expect(error).toBeNull();
    const { data: tenant } = await admin.from("tenants").select("id").eq("slug", slug).single();
    const tid = tenant!.id;
    expect((await admin.from("creators").select("id", { count: "exact", head: true }).eq("tenant_id", tid)).count).toBe(1);
    expect((await admin.from("competitors").select("id", { count: "exact", head: true }).eq("tenant_id", tid)).count).toBe(3);
    const { data: ev } = await admin.from("events").select("id").eq("tenant_id", tid).single();
    const { data: mkt } = await admin.from("markets").select("id, question").eq("event_id", ev!.id).single();
    expect(mkt!.question).toBe("Which Racer will win?"); // app.default_market_question uses the "Racer" vocabulary
    expect((await admin.from("market_options").select("id", { count: "exact", head: true }).eq("market_id", mkt!.id)).count).toBe(3);
    // Draft was enabled in the template → draft settings created.
    expect((await admin.from("competition_draft_settings").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("is_enabled", true)).count).toBe(1);
  });

  it("rolls back completely when demo seeding fails (no partial tenant, no orphan assignment)", async () => {
    const slug = `mt-rollback-${s}`;
    const { error } = await create(badVersion, slug, {}, true);
    expect(error).not.toBeNull();
    expect((await admin.from("tenants").select("id", { count: "exact", head: true }).eq("slug", slug)).count).toBe(0);
    // No orphan assignment referencing a non-existent tenant.
    const { data: t } = await admin.from("tenants").select("id").eq("slug", slug).maybeSingle();
    expect(t).toBeNull();
  });

  it("rejects a duplicate slug cleanly", async () => {
    const slug = `mt-dup-${s}`;
    createdSlugs.push(slug);
    expect((await create(goodVersion, slug)).error).toBeNull();
    const second = await create(goodVersion, slug);
    expect(second.error).not.toBeNull();
    expect(second.error!.message).toMatch(/SLUG_TAKEN/);
    expect((await admin.from("tenants").select("id", { count: "exact", head: true }).eq("slug", slug)).count).toBe(1);
  });

  it("rejects an unpublished (draft) version and a retired template", async () => {
    expect((await create(draftVersion, `mt-draft-${s}`)).error!.message).toMatch(/TEMPLATE_NOT_PUBLISHED/);
    expect((await create(retiredVersion, `mt-retired-${s}`)).error!.message).toMatch(/TEMPLATE_RETIRED/);
  });

  it("refuses a non-super-admin caller", async () => {
    const anon = anonClient();
    const { error } = (await anon.rpc("create_tenant_from_template" as never, {
      p_template_version_id: goodVersion, p_identity: { slug: `mt-anon-${s}`, display_name: "x" }, p_overrides: {}, p_include_demo: false,
    } as never)) as unknown as Rpc<unknown>;
    expect(error).not.toBeNull();
  });
});
