// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Configuration Engine — the platform-default tier (finding F-11).
 *
 * A tenant with NO tenant_settings row must fall back to the platform default
 * revenue split from `platform_config`, and that default must be config-driven
 * (changing the row changes the resolved split), not a hard-coded literal.
 */
d("configuration engine — platform-default revenue split", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let buyerId: string;
  let creatorOwnerId: string;
  let creatorId: string;
  let supportId: string;

  const money = (n: number) => ({ amountMinorUnits: n, currencyCode: "USD" });
  const apply = (event: Record<string, unknown>) =>
    admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: event } as never);
  const orderEvent = (orderId: string) => ({
    type: "order_created",
    customData: { tenant_id: tenantId, user_id: buyerId, internal_billing_product_id: supportId },
    order: { providerOrderId: orderId, providerCustomerId: "c", status: "paid", subtotal: money(1000), tax: money(0), total: money(1000), refunded: money(0), purchasedAt: new Date().toISOString() },
  });
  const shareFor = async (orderId: string) => {
    const { data: order } = await admin.from("billing_orders").select("id").eq("provider_order_id", orderId).single();
    const { data: earn } = await admin.from("creator_earnings").select("creator_share_minor_units, platform_share_minor_units").eq("billing_order_id", order!.id).single();
    return earn!;
  };

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `cfg-${s}`, display_name: "Cfg" }).select("id").single();
    tenantId = t!.id;
    // Intentionally NO tenant_settings row → the split must fall back to platform_config.
    buyerId = await createUser(`cfgbuyer-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: buyerId, role: "member" });
    creatorOwnerId = await createUser(`cfgowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: creatorOwnerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    const { data: sup } = await admin.from("billing_products").insert({ tenant_id: tenantId, product_type: "creator_support", name: "Support", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 1000, billing_interval: "monthly", creator_id: creatorId }).select("id").single();
    supportId = sup!.id;
  }, 40_000);

  afterAll(async () => {
    // Restore the platform default in case a later assertion changed it.
    await admin.from("platform_config").update({ default_creator_share_bps: 8000, default_platform_share_bps: 2000 }).eq("id", true);
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [buyerId, creatorOwnerId]) if (id) await deleteUser(id);
  });

  it("uses the platform default split when the tenant has no settings row", async () => {
    expect((await apply(orderEvent(`cfg_a_${s}`))).error).toBeNull();
    const earn = await shareFor(`cfg_a_${s}`);
    expect(earn.creator_share_minor_units).toBe(800); // 80% of 1000 = platform default
    expect(earn.platform_share_minor_units).toBe(200);
  });

  it("reflects a changed platform default (config-driven, not hard-coded)", async () => {
    await admin.from("platform_config").update({ default_creator_share_bps: 7000, default_platform_share_bps: 3000 }).eq("id", true);
    expect((await apply(orderEvent(`cfg_b_${s}`))).error).toBeNull();
    const earn = await shareFor(`cfg_b_${s}`);
    expect(earn.creator_share_minor_units).toBe(700); // 70% now — resolved from platform_config
    expect(earn.platform_share_minor_units).toBe(300);
  });
});
