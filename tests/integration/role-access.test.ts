// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, anonClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * RX.7 — role/authorization boundaries at the DB layer (UI hiding is never the
 * control). Confirms the self-service path is guarded, the admin-only path stayed
 * gated after the 0071 refactor, and template listing exposes only published rows.
 */
d("role access boundaries", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  const users: string[] = [];
  const createdTenants: string[] = [];
  let versionId = "";
  let memberEmail = "";

  beforeAll(async () => {
    const { data: v } = await admin.from("tenant_template_versions").select("id").not("published_at", "is", null).limit(1).single();
    versionId = (v as { id: string }).id;
    memberEmail = `ra-member-${s}@example.test`;
    users.push(await createUser(memberEmail, pw));
  }, 60_000);

  afterAll(async () => {
    if (createdTenants.length) await admin.from("tenants").delete().in("id", createdTenants);
    for (const u of users) if (u) await deleteUser(u);
  });

  const identity = (slug: string) => ({ slug, display_name: "X", locale: "en", timezone: "UTC" });

  it("blocks anonymous self-service creation", async () => {
    const anon = anonClient();
    const { error } = await anon.rpc("create_pollpool", { p_template_version_id: versionId, p_identity: identity(`ra-anon-${s}`) as never, p_overrides: {} as never, p_include_demo: false } as never);
    expect(error?.message).toContain("NOT_AUTHORIZED");
  });

  it("keeps the admin create-from-template path super-admin only (unchanged by the refactor)", async () => {
    const member = await signInAs(memberEmail, pw);
    const { error } = await member.rpc("create_tenant_from_template", {
      p_template_version_id: versionId, p_identity: identity(`ra-admin-${s}`) as never, p_overrides: {} as never, p_include_demo: false, p_demo_owner: null,
    } as never);
    expect(error?.message).toContain("NOT_AUTHORIZED");
    // And no tenant leaked through.
    expect((await admin.from("tenants").select("id").eq("slug", `ra-admin-${s}`)).data?.length ?? 0).toBe(0);
  });

  it("lets an authenticated member self-create (the intended path) and become operator, not admin", async () => {
    const member = await signInAs(memberEmail, pw);
    const { data, error } = await member.rpc("create_pollpool", { p_template_version_id: versionId, p_identity: identity(`ra-ok-${s}`) as never, p_overrides: {} as never, p_include_demo: false } as never);
    expect(error).toBeNull();
    const tenantId = (data as { tenant_id: string }).tenant_id;
    createdTenants.push(tenantId);
    const memberId = users[0]!;
    expect((await admin.from("creators").select("id").eq("tenant_id", tenantId).eq("owner_user_id", memberId)).data?.length ?? 0).toBe(1);
    expect((await admin.from("user_roles").select("id").eq("user_id", memberId).eq("role", "super_admin").is("tenant_id", null)).data?.length ?? 0).toBe(0);
  });

  it("list_starter_templates returns only published templates", async () => {
    const member = await signInAs(memberEmail, pw);
    const { data, error } = await member.rpc("list_starter_templates");
    expect(error).toBeNull();
    const rows = (data ?? []) as { version_id: string }[];
    expect(rows.length).toBeGreaterThan(0);
    // Every listed version is published.
    for (const r of rows) {
      const v = (await admin.from("tenant_template_versions").select("published_at").eq("id", r.version_id).single()).data;
      expect(v?.published_at).not.toBeNull();
    }
  });
});
