// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, uniqueSuffix, integrationEnvReady } from "./helpers";
import { resolveTenantUrl } from "@/lib/tenant/urls";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * PL.2 — server-derived tenant return URLs (billing, auth). Bound to the tenant's
 * verified PRIMARY custom domain when present (clean root path), else the platform
 * `/t/{slug}` fallback. Never a client-supplied URL.
 */
d("tenant return URLs", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  let tenantId = "";
  const slug = `ru-${s}`;

  beforeAll(async () => {
    const { data } = await admin.from("tenants").insert({ slug, display_name: "RU" } as never).select("id").single();
    tenantId = data!.id;
  });
  afterAll(async () => {
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("falls back to the platform tenant URL when there is no primary custom domain", async () => {
    expect(await resolveTenantUrl(admin, slug, "/billing?status=pending")).toBe(`${appUrl}/t/${slug}/billing?status=pending`);
    expect(await resolveTenantUrl(admin, slug, "/")).toBe(`${appUrl}/t/${slug}`);
  });

  it("uses the verified primary custom domain (clean root path) when present", async () => {
    await admin.from("tenant_domains").insert({
      tenant_id: tenantId, domain: `ru-${s}.example`, is_primary: true, verified: true,
      verification_status: "verified", verification_token: "tok",
    } as never);
    expect(await resolveTenantUrl(admin, slug, "/billing?status=pending")).toBe(`https://ru-${s}.example/billing?status=pending`);
    expect(await resolveTenantUrl(admin, slug, "/")).toBe(`https://ru-${s}.example/`);
  });

  it("ignores an UNVERIFIED domain (does not leak into the return URL)", async () => {
    await admin.from("tenant_domains").update({ is_primary: false, verified: false } as never).eq("tenant_id", tenantId);
    expect(await resolveTenantUrl(admin, slug, "/billing?status=pending")).toBe(`${appUrl}/t/${slug}/billing?status=pending`);
  });
});
