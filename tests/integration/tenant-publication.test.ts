// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * PL.4 — self-service publication lifecycle. Self-created communities start
 * UNLISTED (operable by direct URL, absent from discovery) and are published
 * deliberately once OBJECTIVE criteria are met — never Health/plan/WAU/domain gated,
 * never admin-approved. Legacy tenants stay listed.
 */
d("tenant publication", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  const users: string[] = [];
  const createdTenants: string[] = [];
  let versionId = "";
  let ownerEmail = "";
  let client!: Awaited<ReturnType<typeof signInAs>>;
  let tenantId = "";
  const slug = `pub-${s}`;

  beforeAll(async () => {
    const { data: v } = await admin.from("tenant_template_versions").select("id").not("published_at", "is", null).limit(1).single();
    versionId = (v as { id: string }).id;
    ownerEmail = `pub-owner-${s}@example.test`;
    users.push(await createUser(ownerEmail, pw)); // createUser confirms the email
    client = await signInAs(ownerEmail, pw);
    const { data } = await client.rpc("create_pollpool", {
      p_template_version_id: versionId,
      p_identity: { slug, display_name: "Pub League", locale: "en", timezone: "UTC" } as never,
      p_overrides: { description: "A community for testing publication." } as never,
      p_include_demo: false,
    } as never);
    tenantId = (data as { tenant_id: string }).tenant_id;
    createdTenants.push(tenantId);
  }, 60_000);

  afterAll(async () => {
    if (createdTenants.length) await admin.from("tenants").delete().in("id", createdTenants);
    for (const u of users) if (u) await deleteUser(u);
  });

  it("starts unlisted but fully operable (status active)", async () => {
    const t = (await admin.from("tenants").select("status, listed").eq("id", tenantId).single()).data;
    expect(t).toMatchObject({ status: "active", listed: false });
  });

  it("is absent from platform discovery while unlisted", async () => {
    const listed = (await admin.from("tenants").select("id").eq("status", "active").eq("listed", true).eq("id", tenantId)).data ?? [];
    expect(listed.length).toBe(0);
  });

  it("cannot publish without a published event (objective criterion), then can once eligible", async () => {
    // No event yet → not eligible → publish rejected.
    let elig = (await client.rpc("pollpool_publish_eligibility", { p_tenant: tenantId } as never)).data as { eligible: boolean; checks: Record<string, boolean> };
    expect(elig.checks.owner_email_verified).toBe(true);
    expect(elig.checks.name).toBe(true);
    expect(elig.checks.description).toBe(true);
    expect(elig.checks.has_published_event).toBe(false);
    expect(elig.eligible).toBe(false);
    expect((await client.rpc("publish_pollpool", { p_tenant: tenantId } as never)).error?.message).toContain("NOT_ELIGIBLE");

    // Add a published (non-draft) event → now eligible → publish succeeds.
    const creator = (await admin.from("creators").select("id").eq("tenant_id", tenantId).eq("owner_user_id", users[0]!).single()).data!;
    await admin.from("events").insert({ tenant_id: tenantId, creator_id: creator.id, title: "Opening", slug: `open-${s}`, status: "open", starts_at: new Date().toISOString(), locks_at: new Date(Date.now() + 3600_000).toISOString() } as never);
    elig = (await client.rpc("pollpool_publish_eligibility", { p_tenant: tenantId } as never)).data as never;
    expect(elig.eligible).toBe(true);
    expect((await client.rpc("publish_pollpool", { p_tenant: tenantId } as never)).error).toBeNull();

    // Now listed and discoverable — without any Health/plan/WAU/domain involvement.
    const t = (await admin.from("tenants").select("listed").eq("id", tenantId).single()).data;
    expect(t?.listed).toBe(true);
  });

  it("rejects publication by a non-owner", async () => {
    const other = `pub-other-${s}@example.test`;
    users.push(await createUser(other, pw));
    const otherClient = await signInAs(other, pw);
    expect((await otherClient.rpc("pollpool_publish_eligibility", { p_tenant: tenantId } as never)).error?.message).toContain("NOT_AUTHORIZED");
  });

  it("leaves legacy/admin-created tenants listed by default", async () => {
    const { data: legacy } = await admin.from("tenants").insert({ slug: `legacy-${s}`, display_name: "Legacy" } as never).select("id, listed").single();
    createdTenants.push(legacy!.id);
    expect(legacy!.listed).toBe(true);
    // marbles (seeded) remains listed.
    expect((await admin.from("tenants").select("listed").eq("slug", "marbles").maybeSingle()).data?.listed).toBe(true);
  });
});
