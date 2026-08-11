// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * RX.4 — self-service "Create Your PollPool". Verifies the atomic create_pollpool
 * path: the creator becomes the tenant operator, media stays optional (no YouTube
 * requirement), feature toggles persist, guardrails hold (slug validation, cap),
 * and existing tenants are untouched. Provisioning reuses the same internal as the
 * admin create-from-template path.
 */
d("self-service PollPool creation", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  const users: string[] = [];
  const createdTenants: string[] = [];
  let versionId = "";
  let userEmail = "";
  let userId = "";
  let client!: Awaited<ReturnType<typeof signInAs>>;

  const identity = (slug: string, name = "My League") => ({ slug, display_name: name, locale: "en", timezone: "UTC", creator_name: name });
  const create = (client: typeof admin, ident: object, overrides: object = {}) =>
    client.rpc("create_pollpool", { p_template_version_id: versionId, p_identity: ident as never, p_overrides: overrides as never, p_include_demo: false } as never);

  beforeAll(async () => {
    const { data: v } = await admin
      .from("tenant_template_versions")
      .select("id, template_id, tenant_templates!inner(status)")
      .not("published_at", "is", null)
      .limit(1)
      .single();
    versionId = (v as { id: string }).id;

    userEmail = `sp-owner-${s}@example.test`;
    userId = await createUser(userEmail, pw);
    users.push(userId);
    client = await signInAs(userEmail, pw);
  }, 60_000);

  afterAll(async () => {
    if (createdTenants.length) await admin.from("tenants").delete().in("id", createdTenants);
    for (const u of users) if (u) await deleteUser(u);
  });

  it("creates a tenant the caller owns and operates, with an auto-assigned plan", async () => {
    const slug = `sp-${s}-a`;
    const { data, error } = await create(client, identity(slug, "Alpha League"));
    expect(error).toBeNull();
    const tenantId = (data as { tenant_id: string }).tenant_id;
    createdTenants.push(tenantId);

    // Owner is an active creator-role member with a pending-verification creator.
    const membership = (await admin.from("tenant_memberships").select("role, status").eq("tenant_id", tenantId).eq("user_id", userId).single()).data;
    expect(membership).toMatchObject({ role: "creator", status: "active" });
    const creator = (await admin.from("creators").select("verification_status").eq("tenant_id", tenantId).eq("owner_user_id", userId).single()).data;
    expect(creator?.verification_status).toBe("pending");
    // Never auto-granted super admin.
    expect((await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "super_admin").is("tenant_id", null)).data?.length ?? 0).toBe(0);
    // Revenue Plan auto-assigned by the existing trigger (tenants never choose it).
    expect((await admin.from("tenant_revenue_plan_assignments").select("id").eq("tenant_id", tenantId)).data?.length ?? 0).toBeGreaterThan(0);
  });

  it("keeps media optional (no YouTube requirement) and persists the Creator Support toggle", async () => {
    const slug = `sp-${s}-b`;
    const { data, error } = await create(client, identity(slug, "Beta League"), { description: "Beta", featureFlags: { creator_support_enabled: true } });
    expect(error).toBeNull();
    const tenantId = (data as { tenant_id: string }).tenant_id;
    createdTenants.push(tenantId);

    const settings = (await admin.from("tenant_settings").select("event_media_optional, event_media_enabled").eq("tenant_id", tenantId).single()).data;
    expect(settings?.event_media_optional).toBe(true); // media never mandatory
    const flag = (await admin.from("tenant_feature_flags").select("enabled").eq("tenant_id", tenantId).eq("flag", "creator_support_enabled").maybeSingle()).data;
    expect(flag?.enabled).toBe(true); // toggle persisted
  });

  it("rejects a duplicate slug and an invalid slug without leaving a partial tenant", async () => {
    const slug = `sp-${s}-dup`;
    const first = await create(client, identity(slug));
    expect(first.error).toBeNull();
    createdTenants.push((first.data as { tenant_id: string }).tenant_id);

    const before = (await admin.from("tenants").select("id", { count: "exact", head: true })).count ?? 0;
    expect((await create(client, identity(slug))).error?.message).toContain("SLUG_TAKEN");
    expect((await create(client, identity("Bad Slug!"))).error?.message).toContain("INVALID_SLUG");
    const after = (await admin.from("tenants").select("id", { count: "exact", head: true })).count ?? 0;
    expect(after).toBe(before); // atomic: nothing partially created
  });

  it("enforces the per-user community cap", async () => {
    const capUserEmail = `sp-cap-${s}@example.test`;
    const capUser = await createUser(capUserEmail, pw);
    users.push(capUser);
    // Seed 10 owned tenants (the cap) directly, then attempt an 11th via the RPC.
    for (let i = 0; i < 10; i++) {
      const { data: t } = await admin.from("tenants").insert({ slug: `spcap-${s}-${i}`, display_name: `Cap ${i}` } as never).select("id").single();
      createdTenants.push(t!.id);
      await admin.from("creators").insert({ tenant_id: t!.id, owner_user_id: capUser, display_name: "C", slug: `capc-${s}-${i}`, verification_status: "pending" } as never);
    }
    const capClient = await signInAs(capUserEmail, pw);
    expect((await create(capClient, identity(`sp-${s}-over`))).error?.message).toContain("TENANT_LIMIT_REACHED");
  });

  it("leaves existing tenants untouched (marbles still resolves)", async () => {
    const marbles = (await admin.from("tenants").select("id, status").eq("slug", "marbles").maybeSingle()).data;
    expect(marbles?.status).toBe("active");
  });

  it("still lets a super admin create from a template (admin path unchanged)", async () => {
    const { error } = await admin.rpc("create_tenant_from_template", {
      p_template_version_id: versionId, p_identity: identity(`sp-${s}-admin`, "Admin League") as never,
      p_overrides: {} as never, p_include_demo: false, p_demo_owner: null,
    } as never);
    expect(error).toBeNull();
    const t = (await admin.from("tenants").select("id").eq("slug", `sp-${s}-admin`).single()).data;
    createdTenants.push(t!.id);
  });
});
