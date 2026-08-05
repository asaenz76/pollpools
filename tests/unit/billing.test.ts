import { describe, it, expect } from "vitest";
import { MockBillingProvider } from "@/lib/billing/mock-provider";
import { LemonSqueezyBillingProvider } from "@/lib/billing/lemon-squeezy-provider";

describe("MockBillingProvider", () => {
  const p = new MockBillingProvider();
  const secret = "whsec_test";

  it("verifies a correctly-signed webhook and rejects tampering / wrong secret", () => {
    const body = MockBillingProvider.buildEvent({ eventId: "e1", eventName: "order_created", customData: { tenant_id: "t" } });
    const sig = MockBillingProvider.sign(body, secret);
    expect(p.verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(p.verifyWebhookSignature(body + " ", sig, secret)).toBe(false);
    expect(p.verifyWebhookSignature(body, sig, "wrong")).toBe(false);
    expect(p.verifyWebhookSignature(body, "deadbeef", secret)).toBe(false);
  });

  it("normalizes an order event with custom data", () => {
    const body = MockBillingProvider.buildEvent({
      eventId: "e2",
      eventName: "order_created",
      customData: { tenant_id: "t1", user_id: "u1", internal_billing_product_id: "p1" },
      order: { total: 500, currency: "USD", providerOrderId: "o1" } as never,
    });
    const ev = p.parseWebhookEvent(body);
    expect(ev.type).toBe("order_created");
    expect(ev.providerEventId).toBe("e2");
    expect(ev.customData.tenant_id).toBe("t1");
    expect(ev.order?.total.amountMinorUnits).toBe(500);
  });

  it("builds a checkout URL that points at the mock pay route", async () => {
    const co = await p.createCheckout({ providerVariantId: "v1", customData: { checkout_id: "abc" }, redirectUrl: "http://localhost:3000/t/x/billing", testMode: true });
    expect(co.status).toBe("open");
    expect(co.url).toContain("/api/billing/mock/pay?checkout_id=abc");
  });

  it("cancel sets cancel-at-period-end", async () => {
    const sub = await p.cancelSubscription("s1");
    expect(sub.cancelAtPeriodEnd).toBe(true);
  });
});

describe("LemonSqueezyBillingProvider", () => {
  const ls = new LemonSqueezyBillingProvider({ apiKey: "k", storeId: "1", webhookSecret: "whsec", testMode: true });

  it("verifies HMAC-SHA256 signatures", () => {
    const body = JSON.stringify({ meta: { event_name: "order_created" }, data: { id: "1", type: "orders", attributes: {} } });
    const good = MockBillingProvider.sign(body, "whsec"); // same HMAC-SHA256
    expect(ls.verifyWebhookSignature(body, good, "whsec")).toBe(true);
    expect(ls.verifyWebhookSignature(body, good, "other")).toBe(false);
  });

  it("normalizes an order_created event", () => {
    const body = JSON.stringify({
      meta: { event_name: "order_created", custom_data: { tenant_id: "t", user_id: "u", internal_billing_product_id: "p" } },
      data: { id: "100", type: "orders", attributes: { customer_id: 7, status: "paid", subtotal: 500, tax: 0, total: 500, refunded: false, refunded_amount: 0, currency: "USD", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } },
    });
    const ev = ls.parseWebhookEvent(body);
    expect(ev.type).toBe("order_created");
    expect(ev.order?.providerOrderId).toBe("100");
    expect(ev.order?.total.amountMinorUnits).toBe(500);
    expect(ev.order?.providerCustomerId).toBe("7");
    expect(ev.customData.internal_billing_product_id).toBe("p");
    // Deterministic event id from immutable id + name + timestamp.
    expect(ev.providerEventId).toBe("order_created:100:2026-01-01T00:00:00Z");
  });

  it("maps subscription status and cancel-at-period-end", () => {
    const body = (status: string, cancelled: boolean) =>
      JSON.stringify({ meta: { event_name: "subscription_updated" }, data: { id: "42", type: "subscriptions", attributes: { customer_id: 7, status, cancelled, renews_at: "2026-02-01T00:00:00Z", ends_at: null, created_at: "2026-01-01T00:00:00Z" } } });
    expect(ls.parseWebhookEvent(body("on_trial", false)).subscription?.status).toBe("trialing");
    expect(ls.parseWebhookEvent(body("past_due", false)).subscription?.status).toBe("past_due");
    const cancelled = ls.parseWebhookEvent(body("active", true)).subscription!;
    expect(cancelled.status).toBe("active");
    expect(cancelled.cancelAtPeriodEnd).toBe(true);
  });

  it("marks refunds on order_refunded", () => {
    const body = JSON.stringify({
      meta: { event_name: "order_refunded" },
      data: { id: "100", type: "orders", attributes: { status: "refunded", refunded: true, refunded_amount: 500, total: 500, currency: "USD", created_at: "2026-01-01T00:00:00Z" } },
    });
    const ev = ls.parseWebhookEvent(body);
    expect(ev.type).toBe("order_refunded");
    expect(ev.order?.status).toBe("refunded");
    expect(ev.refund?.amount.amountMinorUnits).toBe(500);
  });

  it("does not support API-initiated refunds (recorded via webhook)", async () => {
    await expect(ls.refundOrder()).rejects.toThrow();
  });
});
