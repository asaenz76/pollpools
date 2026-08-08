// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { resolveVocabulary } from "@/lib/vocabulary";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = { data: T | null; error: { message: string } | null };

/**
 * Phase 8-D 8D.5 — version immutability, no silent migration, retire safety, and
 * backwards compatibility (the template relationship is optional; legacy tenants
 * are never forced or rewritten).
 */
d("Template versions + backwards compatibility (8D.5)", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let owner = "";
  let templateId = "";
  let v1 = "";
  let v2 = "";
  const cleanupTenants: string[] = [];

  const cfg = (competitor: string) => ({
    locale: "en", timezone: "UTC",
    vocabulary: { competitor: { singular: competitor, plural: competitor + "s" } },
    providers: { result: "manual", event: "manual", notification: ["in_app"] },
    featureFlags: { predictions_enabled: true, global_leaderboard_enabled: true },
  });
  const create = (versionId: string, slug: string) =>
    admin.rpc("create_tenant_from_template" as never, {
      p_template_version_id: versionId, p_identity: { slug, display_name: slug }, p_overrides: {}, p_include_demo: false, p_demo_owner: owner,
    } as never) as unknown as Promise<Rpc<{ tenant_id: string }>>;

  beforeAll(async () => {
    owner = await createUser(`tv-${s}@t.test`, "Password123!");
    const { data: t } = await admin.from("tenant_templates").insert({ key: `tv-${s}`, name: "TV", category: "general", status: "published", latest_version: 1 } as never).select("id").single();
    templateId = t!.id;
    // v1 published (competitor = "Alpha")
    const { data: r1 } = await admin.from("tenant_template_versions").insert({ template_id: templateId, version: 1, engine_version: "1.0", configuration: cfg("Alpha") as never, published_at: new Date().toISOString() } as never).select("id").single();
    v1 = r1!.id;
  });

  afterAll(async () => {
    for (const id of cleanupTenants) await admin.from("tenants").delete().eq("id", id);
    await admin.from("tenant_templates").delete().eq("id", templateId);
    if (owner) await deleteUser(owner);
  });

  it("makes a published version immutable (no edit, no delete)", async () => {
    const upd = await admin.from("tenant_template_versions").update({ changelog: "hack" } as never).eq("id", v1);
    expect(upd.error).not.toBeNull();
    expect(upd.error!.message).toMatch(/IMMUTABLE/);
    const del = await admin.from("tenant_template_versions").delete().eq("id", v1);
    expect(del.error).not.toBeNull();
  });

  it("supports a new version without altering v1", async () => {
    // v2 as draft, then publish via the allowed null→timestamp transition.
    const { data: r2 } = await admin.from("tenant_template_versions").insert({ template_id: templateId, version: 2, engine_version: "1.0", configuration: cfg("Beta") as never } as never).select("id").single();
    v2 = r2!.id;
    const pub = await admin.from("tenant_template_versions").update({ published_at: new Date().toISOString() } as never).eq("id", v2);
    expect(pub.error).toBeNull();
    await admin.from("tenant_templates").update({ latest_version: 2 } as never).eq("id", templateId);

    // v1's configuration is unchanged.
    const { data: v1row } = await admin.from("tenant_template_versions").select("configuration").eq("id", v1).single();
    expect((v1row!.configuration as { vocabulary: { competitor: { singular: string } } }).vocabulary.competitor.singular).toBe("Alpha");
  });

  it("keeps a v1 tenant on its snapshot when v2 is published (no silent migration)", async () => {
    const slug = `tv-onev1-${s}`;
    const { data, error } = await create(v1, slug);
    expect(error).toBeNull();
    cleanupTenants.push(data!.tenant_id);

    const { data: before } = await admin.from("tenant_settings").select("vocabulary").eq("tenant_id", data!.tenant_id).single();
    expect(resolveVocabulary(before!.vocabulary).competitor.singular).toBe("Alpha");

    // Publish another version — the existing tenant must NOT change.
    const { data: r3 } = await admin.from("tenant_template_versions").insert({ template_id: templateId, version: 3, engine_version: "1.0", configuration: cfg("Gamma") as never, published_at: new Date().toISOString() } as never).select("id").single();
    await admin.from("tenant_templates").update({ latest_version: 3 } as never).eq("id", templateId);
    void r3;

    const { data: after } = await admin.from("tenant_settings").select("vocabulary").eq("tenant_id", data!.tenant_id).single();
    expect(resolveVocabulary(after!.vocabulary).competitor.singular).toBe("Alpha"); // still v1's value
    const { data: asg } = await admin.from("tenant_template_assignments").select("template_version").eq("tenant_id", data!.tenant_id).single();
    expect(asg!.template_version).toBe(1);
  });

  it("blocks new creation from a retired template but leaves its tenants working", async () => {
    const slug = `tv-retire-${s}`;
    const { data } = await create(v1, slug);
    cleanupTenants.push(data!.tenant_id);

    await admin.from("tenant_templates").update({ status: "retired" } as never).eq("id", templateId);
    const blocked = await create(v1, `tv-retire-new-${s}`);
    expect(blocked.error!.message).toMatch(/TEMPLATE_RETIRED/);
    // The already-created tenant still resolves.
    const { data: settings } = await admin.from("tenant_settings").select("vocabulary").eq("tenant_id", data!.tenant_id).single();
    expect(resolveVocabulary(settings!.vocabulary).competitor.singular).toBe("Alpha");
    await admin.from("tenant_templates").update({ status: "published" } as never).eq("id", templateId); // restore for other tests
  });

  it("keeps the template relationship OPTIONAL — a legacy tenant works with no template", async () => {
    const { data: legacy } = await admin.from("tenants").insert({ slug: `tv-legacy-${s}`, display_name: "Legacy" } as never).select("id, template_id, template_version").single();
    cleanupTenants.push(legacy!.id);
    expect(legacy!.template_id).toBeNull();
    expect(legacy!.template_version).toBeNull();
    // No assignment row.
    expect((await admin.from("tenant_template_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", legacy!.id)).count).toBe(0);
    // Still gets the default Revenue Plan (existing trigger) and resolves.
    const { data: plan } = await admin.from("tenant_revenue_plan_assignments").select("revenue_plans(key)").eq("tenant_id", legacy!.id).is("ended_at", null).single();
    const p = Array.isArray(plan!.revenue_plans) ? plan!.revenue_plans[0] : plan!.revenue_plans;
    expect(p!.key).toBe("starter");
  });

  it("did not force the seeded reference tenant into a template", async () => {
    const { data: marbles } = await admin.from("tenants").select("template_id").eq("slug", "marbles").maybeSingle();
    if (marbles) expect(marbles.template_id).toBeNull();
  });
});
