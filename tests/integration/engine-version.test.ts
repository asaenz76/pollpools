// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { adminClient, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Engine versioning storage guarantees (§13): a tenant is pinned to an X.Y
 * version, defaulting to the current one, and "latest" is structurally rejected.
 */
d("engine versioning — per-tenant pin", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  const ids: string[] = [];

  afterAll(async () => {
    for (const id of ids) await admin.from("tenants").delete().eq("id", id);
  });

  it("defaults a new tenant to an X.Y engine version", async () => {
    const { data, error } = await admin.from("tenants").insert({ slug: `ev-${s}`, display_name: "EV" }).select("id, engine_version").single();
    expect(error).toBeNull();
    ids.push(data!.id);
    expect(data!.engine_version).toMatch(/^[0-9]+\.[0-9]+$/);
  });

  it("rejects engine_version = 'latest'", async () => {
    const { error } = await admin.from("tenants").insert({ slug: `ev-latest-${s}`, display_name: "EV", engine_version: "latest" }).select("id").single();
    expect(error?.message ?? "").toMatch(/chk_tenant_engine_version|violates check/i);
  });

  it("exposes the platform default engine version", async () => {
    const { data } = await admin.from("platform_config").select("default_engine_version").maybeSingle();
    expect(data!.default_engine_version).toMatch(/^[0-9]+\.[0-9]+$/);
  });
});
