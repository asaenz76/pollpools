import type { BillingProvider } from "./provider";
import { hmacSha256Hex, constantTimeEqualHex } from "./signature";
import type {
  BillingCheckout,
  BillingCustomer,
  BillingOrder,
  BillingSubscription,
  BillingRefund,
  BillingWebhookEvent,
  BillingEventType,
  CreateCheckoutInput,
} from "./types";

/**
 * Mock billing provider (spec §1) for tests + local development. It signs mock
 * webhooks with HMAC-SHA256 (so signature verification + replay handling are
 * exercised end to end) and produces the same normalized events as a real
 * provider. State of record lives in our DB, not the provider.
 */
export class MockBillingProvider implements BillingProvider {
  readonly id = "mock" as const;

  static sign(rawBody: string, secret: string): string {
    return hmacSha256Hex(rawBody, secret);
  }

  /** Build a signed mock webhook payload for tests / the mock-pay route. */
  static buildEvent(input: {
    eventId: string;
    eventName: BillingEventType;
    customData: Record<string, string>;
    order?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    refund?: Record<string, unknown>;
  }): string {
    return JSON.stringify({
      event_id: input.eventId,
      event_name: input.eventName,
      custom_data: input.customData,
      order: input.order,
      subscription: input.subscription,
      refund: input.refund,
    });
  }

  async createCheckout(input: CreateCheckoutInput): Promise<BillingCheckout> {
    const origin = new URL(input.redirectUrl).origin;
    const checkoutId = input.customData.checkout_id ?? "unknown";
    const url = `${origin}/api/billing/mock/pay?checkout_id=${encodeURIComponent(checkoutId)}`;
    return { providerCheckoutId: `mock_co_${checkoutId}`, url, status: "open", expiresAt: null };
  }

  async retrieveCheckout(providerCheckoutId: string): Promise<BillingCheckout> {
    return { providerCheckoutId, url: null, status: "open", expiresAt: null };
  }

  async retrieveCustomer(providerCustomerId: string): Promise<BillingCustomer> {
    return { providerCustomerId, email: null, name: null };
  }

  async retrieveOrder(providerOrderId: string): Promise<BillingOrder> {
    const zero = { amountMinorUnits: 0, currencyCode: "USD" };
    return {
      providerOrderId,
      providerCustomerId: null,
      status: "paid",
      subtotal: zero,
      tax: zero,
      total: zero,
      refunded: zero,
      purchasedAt: new Date(0).toISOString(),
      customData: {},
    };
  }

  async retrieveSubscription(providerSubscriptionId: string): Promise<BillingSubscription> {
    return this.sub(providerSubscriptionId, "active", false);
  }
  async cancelSubscription(id: string): Promise<BillingSubscription> {
    return this.sub(id, "active", true);
  }
  async resumeSubscription(id: string): Promise<BillingSubscription> {
    return this.sub(id, "active", false);
  }
  async changeSubscription(id: string): Promise<BillingSubscription> {
    return this.sub(id, "active", false);
  }
  async createCustomerPortalUrl(providerCustomerId: string): Promise<string> {
    return `mock://portal/${providerCustomerId}`;
  }
  async refundOrder(_providerOrderId: string, amountMinorUnits = 0): Promise<BillingRefund> {
    return { providerRefundId: `mock_re_${Math.random().toString(36).slice(2)}`, amount: { amountMinorUnits, currencyCode: "USD" }, status: "succeeded" };
  }

  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    return constantTimeEqualHex(signature, hmacSha256Hex(rawBody, secret));
  }

  parseWebhookEvent(rawBody: string): BillingWebhookEvent {
    const p = JSON.parse(rawBody) as {
      event_id: string;
      event_name: BillingEventType;
      custom_data?: Record<string, string>;
      order?: { id: string; customer_id?: string; status?: string; subtotal?: number; tax?: number; total?: number; refunded?: number; currency?: string; purchased_at?: string };
      subscription?: { id: string; customer_id?: string; status?: string; current_period_start?: string; current_period_end?: string; cancel_at_period_end?: boolean; canceled_at?: string; ended_at?: string; trial_ends_at?: string };
      refund?: { id: string; amount: number; currency?: string; status?: string };
    };
    const customData = p.custom_data ?? {};
    const event: BillingWebhookEvent = {
      providerEventId: p.event_id,
      providerEventName: p.event_name,
      type: p.event_name,
      customData,
    };
    if (p.order) {
      const cur = p.order.currency ?? "USD";
      const m = (n: number | undefined) => ({ amountMinorUnits: n ?? 0, currencyCode: cur });
      event.order = {
        providerOrderId: p.order.id,
        providerCustomerId: p.order.customer_id ?? null,
        status: (p.order.status as BillingOrder["status"]) ?? "paid",
        subtotal: m(p.order.subtotal ?? p.order.total),
        tax: m(p.order.tax),
        total: m(p.order.total),
        refunded: m(p.order.refunded),
        purchasedAt: p.order.purchased_at ?? new Date(0).toISOString(),
        customData,
      };
    }
    if (p.subscription) {
      event.subscription = {
        providerSubscriptionId: p.subscription.id,
        providerCustomerId: p.subscription.customer_id ?? null,
        status: (p.subscription.status as BillingSubscription["status"]) ?? "active",
        currentPeriodStart: p.subscription.current_period_start ?? null,
        currentPeriodEnd: p.subscription.current_period_end ?? null,
        cancelAtPeriodEnd: p.subscription.cancel_at_period_end ?? false,
        canceledAt: p.subscription.canceled_at ?? null,
        endedAt: p.subscription.ended_at ?? null,
        trialEndsAt: p.subscription.trial_ends_at ?? null,
        customData,
      };
    }
    if (p.refund) {
      event.refund = {
        providerRefundId: p.refund.id,
        amount: { amountMinorUnits: p.refund.amount, currencyCode: p.refund.currency ?? "USD" },
        status: (p.refund.status as BillingRefund["status"]) ?? "succeeded",
      };
    }
    return event;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private sub(id: string, status: BillingSubscription["status"], cancelAtPeriodEnd: boolean): BillingSubscription {
    return {
      providerSubscriptionId: id,
      providerCustomerId: null,
      status,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd,
      canceledAt: null,
      endedAt: null,
      trialEndsAt: null,
      customData: {},
    };
  }
}
