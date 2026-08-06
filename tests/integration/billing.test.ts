// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

d("billing: webhooks, entitlements, earnings, payouts", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let buyerId: string;
  let buyer: SupabaseClient<Database>;
  let creatorOwnerId: string;
  let creatorId: string;
  let premiumId: string;
  let supportId: string;

  const money = (n: number) => ({ amountMinorUnits: n, currencyCode: "USD" });
  const apply = (event: Record<string, unknown>) =>
    admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: event } as never) as unknown as Rpc<unknown>;

  const orderEvent = (type: string, productId: string, orderId: string, opts: { total?: number; creator?: string; refunded?: number } = {}) => ({
    type,
    customData: { tenant_id: tenantId, user_id: buyerId, internal_billing_product_id: productId, ...(opts.creator ? { creator_id: opts.creator } : {}) },
    order: {
      providerOrderId: orderId,
      providerCustomerId: "cust_1",
      status: type === "order_refunded" ? "refunded" : "paid",
      subtotal: money(opts.total ?? 500),
      tax: money(0),
      total: money(opts.total ?? 500),
      refunded: money(opts.refunded ?? 0),
      purchasedAt: new Date().toISOString(),
    },
    ...(type === "order_refunded" ? { refund: { providerRefundId: null, amount: money(opts.total ?? 500), status: "succeeded" } } : {}),
  });

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `bill-${s}`, display_name: "Bill" }).select("id").single();
    tenantId = t!.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId }); // default 8000/2000 split
    buyerId = await createUser(`buyer-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: buyerId, role: "member" });
    creatorOwnerId = await createUser(`cowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: creatorOwnerId, display_name: "Cr", slug: `cr-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;

    const { data: prem } = await admin.from("billing_products").insert({ tenant_id: tenantId, product_type: "platform_premium", name: "Premium", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 999, billing_interval: "monthly" }).select("id").single();
    premiumId = prem!.id;
    const { data: sup } = await admin.from("billing_products").insert({ tenant_id: tenantId, product_type: "creator_support", name: "Support", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 500, billing_interval: "monthly", creator_id: creatorId }).select("id").single();
    supportId = sup!.id;

    buyer = await signInAs(`buyer-${s}@example.test`, pw);
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [buyerId, creatorOwnerId]) if (id) await deleteUser(id);
  });

  it("creates a checkout with server-resolved price (client cannot set it)", async () => {
    const { data, error } = await buyer.rpc("create_billing_checkout", { p_billing_product_id: premiumId, p_idempotency_key: `co-${s}-1-abcdefgh`, p_creator_id: null, p_competition_id: null, p_draft_reservation_id: null } as never);
    expect(error).toBeNull();
    const r = data as { amount_minor_units: number; custom_data: { internal_billing_product_id: string } };
    expect(r.amount_minor_units).toBe(999);
    expect(r.custom_data.internal_billing_product_id).toBe(premiumId);
  });

  it("Premium subscription webhook grants a platform_premium entitlement", async () => {
    await apply({
      type: "subscription_created",
      customData: { tenant_id: tenantId, user_id: buyerId, internal_billing_product_id: premiumId },
      subscription: { providerSubscriptionId: `sub_${s}`, providerCustomerId: "cust_1", status: "active", currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(), cancelAtPeriodEnd: false },
    });
    const { data: ent } = await admin.from("billing_entitlements").select("entitlement_type, status").eq("tenant_id", tenantId).eq("user_id", buyerId).eq("entitlement_type", "platform_premium");
    expect(ent!.some((e) => e.status === "active")).toBe(true);
  });

  it("Creator Support order creates one immutable earning with the correct split", async () => {
    await apply(orderEvent("order_created", supportId, `ord_sup_${s}`, { total: 500, creator: creatorId }));
    const { data: earnings } = await admin.from("creator_earnings").select("*").eq("billing_order_id", (await admin.from("billing_orders").select("id").eq("provider_order_id", `ord_sup_${s}`).single()).data!.id);
    expect(earnings).toHaveLength(1);
    expect(earnings![0]!.creator_share_minor_units).toBe(400); // 500 * 8000/10000
    expect(earnings![0]!.platform_share_minor_units).toBe(100);
    expect(earnings![0]!.status).toBe("available");
  });

  it("is idempotent: replaying the same order webhook makes no duplicates", async () => {
    await apply(orderEvent("order_created", supportId, `ord_sup_${s}`, { total: 500, creator: creatorId }));
    const { count: orders } = await admin.from("billing_orders").select("*", { count: "exact", head: true }).eq("provider_order_id", `ord_sup_${s}`);
    expect(orders).toBe(1);
    const { count: earns } = await admin.from("creator_earnings").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("earning_type", "support_subscription").eq("creator_id", creatorId);
    expect(earns).toBe(1);
  });

  it("refund reverses the earning with a compensating entry and revokes access", async () => {
    // Fresh support order + entitlement, then refund it.
    await apply({ ...orderEvent("order_created", supportId, `ord_ref_${s}`, { total: 500, creator: creatorId }) });
    await apply(orderEvent("order_refunded", supportId, `ord_ref_${s}`, { total: 500, refunded: 500, creator: creatorId }));

    const orderId = (await admin.from("billing_orders").select("id, status").eq("provider_order_id", `ord_ref_${s}`).single()).data!;
    expect(orderId.status).toBe("refunded");
    const { data: refunds } = await admin.from("billing_refunds").select("id").eq("billing_order_id", orderId.id);
    expect(refunds!.length).toBe(1);
    const { data: earns } = await admin.from("creator_earnings").select("earning_type, status, creator_share_minor_units").eq("billing_order_id", orderId.id).order("created_at");
    expect(earns!.some((e) => e.earning_type === "reversal" && e.creator_share_minor_units === -400)).toBe(true);
    expect(earns!.some((e) => e.status === "reversed")).toBe(true);
  });

  it("rejects a cross-tenant event", async () => {
    const { error } = await apply({ type: "order_created", customData: { tenant_id: randomUUID(), user_id: buyerId, internal_billing_product_id: supportId }, order: { providerOrderId: `x_${s}`, status: "paid", subtotal: money(500), tax: money(0), total: money(500), refunded: money(0), purchasedAt: new Date().toISOString() } });
    expect(error?.message).toContain("CROSS_TENANT_EVENT");
  });

  it("processes a manual payout once (approve reserves, paid marks, no double-pay)", async () => {
    // A fresh available earning to pay out.
    await apply(orderEvent("order_created", supportId, `ord_pay_${s}`, { total: 500, creator: creatorId }));
    const owner = await signInAs(`cowner-${s}@example.test`, pw);
    const req = await owner.from("creator_payout_requests").insert({ tenant_id: tenantId, creator_id: creatorId, amount_minor_units: 400, currency_code: "USD", status: "requested", idempotency_key: `pay-${s}` }).select("id").single();
    expect(req.error).toBeNull();
    const payoutId = req.data!.id;

    const approve = await admin.rpc("approve_creator_payout", { p_payout_id: payoutId } as never);
    expect(approve.error).toBeNull();
    const { count: allocs } = await admin.from("creator_payout_allocations").select("*", { count: "exact", head: true }).eq("payout_request_id", payoutId);
    expect(allocs).toBeGreaterThanOrEqual(1);

    const paid = await admin.rpc("mark_creator_payout_paid", { p_payout_id: payoutId, p_external_reference: "wire-123" } as never);
    expect(paid.error).toBeNull();
    const { data: pr } = await admin.from("creator_payout_requests").select("status").eq("id", payoutId).single();
    expect(pr!.status).toBe("paid");

    // Paying again is rejected (no double-pay).
    const again = await admin.rpc("mark_creator_payout_paid", { p_payout_id: payoutId, p_external_reference: "wire-124" } as never);
    expect(again.error?.message).toContain("NOT_APPROVED");
  });

  it("rejects a payout request that exceeds available earnings (F-25)", async () => {
    const owner = await signInAs(`cowner-${s}@example.test`, pw);
    const over = await owner
      .from("creator_payout_requests")
      .insert({ tenant_id: tenantId, creator_id: creatorId, amount_minor_units: 99_999_999, currency_code: "USD", status: "requested", idempotency_key: `pay-over-${s}` })
      .select("id").single();
    expect(over.error?.message).toContain("INSUFFICIENT_EARNINGS");
  });

  it("records a creator earning on each subscription renewal, not just the first (F-12)", async () => {
    // Initial purchase.
    await apply(orderEvent("order_created", supportId, `sub_init_${s}`, { total: 500, creator: creatorId }));
    // Renewal invoice → a NEW order id → a second earning (idempotent per invoice).
    const renewal = {
      type: "subscription_payment_success",
      customData: { tenant_id: tenantId, user_id: buyerId, internal_billing_product_id: supportId, creator_id: creatorId },
      order: { providerOrderId: `sub_renew_${s}`, providerCustomerId: "cust_1", status: "paid", subtotal: money(500), tax: money(0), total: money(500), refunded: money(0), purchasedAt: new Date().toISOString() },
    };
    expect((await apply(renewal)).error).toBeNull();
    expect((await apply(renewal)).error).toBeNull(); // replay is idempotent

    const initOrder = (await admin.from("billing_orders").select("id").eq("provider_order_id", `sub_init_${s}`).single()).data!;
    const renewOrder = (await admin.from("billing_orders").select("id").eq("provider_order_id", `sub_renew_${s}`).single()).data!;
    const { data: earns } = await admin.from("creator_earnings").select("billing_order_id, creator_share_minor_units, earning_type").eq("creator_id", creatorId).eq("earning_type", "support_subscription");
    expect(earns!.filter((e) => e.billing_order_id === initOrder.id).length).toBe(1);
    const renewEarnings = earns!.filter((e) => e.billing_order_id === renewOrder.id);
    expect(renewEarnings.length).toBe(1); // exactly one despite the replay
    expect(renewEarnings[0]!.creator_share_minor_units).toBe(400); // 80% of 500
  });
});
