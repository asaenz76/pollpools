import type { BillingProvider } from "./provider";
import { BillingError, BillingUnsupportedError } from "./provider";
import { hmacSha256Hex, constantTimeEqualHex } from "./signature";
import type {
  BillingCheckout,
  BillingCustomer,
  BillingOrder,
  BillingSubscription,
  BillingRefund,
  BillingWebhookEvent,
  BillingEventType,
  BillingSubscriptionStatus,
  CreateCheckoutInput,
} from "./types";

export type LemonSqueezyConfig = {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
  testMode: boolean;
};

const API = "https://api.lemonsqueezy.com/v1";

/** Map Lemon Squeezy subscription status → normalized status. */
function mapSubStatus(ls: string): BillingSubscriptionStatus {
  switch (ls) {
    case "on_trial":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "cancelled":
    case "expired":
      return "canceled";
    default:
      return "incomplete";
  }
}

/** Map Lemon Squeezy event name → normalized event type. */
function mapEventName(name: string): BillingEventType {
  const known: BillingEventType[] = [
    "order_created",
    "order_refunded",
    "subscription_created",
    "subscription_updated",
    "subscription_cancelled",
    "subscription_resumed",
    "subscription_expired",
    "subscription_payment_success",
    "subscription_payment_failed",
    "subscription_payment_recovered",
  ];
  return known.includes(name as BillingEventType) ? (name as BillingEventType) : "unknown";
}

/**
 * Lemon Squeezy billing adapter (spec §1–5). Server-side only; all provider
 * specifics stay inside this class. Amounts from Lemon Squeezy are already in
 * minor units (cents).
 */
export class LemonSqueezyBillingProvider implements BillingProvider {
  readonly id = "lemon_squeezy" as const;

  constructor(private readonly config: LemonSqueezyConfig) {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new BillingError(`Lemon Squeezy API ${path} failed (${res.status})`, "PROVIDER_ERROR");
    }
    return (await res.json()) as T;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<BillingCheckout> {
    const body = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: input.customerEmail ?? undefined,
            custom: input.customData,
          },
          product_options: { redirect_url: input.redirectUrl },
          test_mode: input.testMode,
        },
        relationships: {
          store: { data: { type: "stores", id: this.config.storeId } },
          variant: { data: { type: "variants", id: input.providerVariantId } },
        },
      },
    };
    const json = await this.api<{ data: { id: string; attributes: { url: string; expires_at: string | null } } }>("/checkouts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { providerCheckoutId: json.data.id, url: json.data.attributes.url, status: "open", expiresAt: json.data.attributes.expires_at };
  }

  async retrieveCheckout(id: string): Promise<BillingCheckout> {
    const json = await this.api<{ data: { id: string; attributes: { url: string; expires_at: string | null } } }>(`/checkouts/${id}`);
    return { providerCheckoutId: json.data.id, url: json.data.attributes.url, status: "open", expiresAt: json.data.attributes.expires_at };
  }

  async retrieveCustomer(id: string): Promise<BillingCustomer> {
    const json = await this.api<{ data: { id: string; attributes: { email: string; name: string } } }>(`/customers/${id}`);
    return { providerCustomerId: json.data.id, email: json.data.attributes.email, name: json.data.attributes.name };
  }

  async retrieveOrder(id: string): Promise<BillingOrder> {
    const json = await this.api<{ data: { id: string; attributes: LsOrderAttributes } }>(`/orders/${id}`);
    return this.orderFrom(id, json.data.attributes, {});
  }

  async retrieveSubscription(id: string): Promise<BillingSubscription> {
    const json = await this.api<{ data: { id: string; attributes: LsSubAttributes } }>(`/subscriptions/${id}`);
    return this.subFrom(id, json.data.attributes, {});
  }

  async cancelSubscription(id: string): Promise<BillingSubscription> {
    const json = await this.api<{ data: { id: string; attributes: LsSubAttributes } }>(`/subscriptions/${id}`, { method: "DELETE" });
    return this.subFrom(id, json.data.attributes, {});
  }

  async resumeSubscription(id: string): Promise<BillingSubscription> {
    const body = { data: { type: "subscriptions", id, attributes: { cancelled: false } } };
    const json = await this.api<{ data: { id: string; attributes: LsSubAttributes } }>(`/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    return this.subFrom(id, json.data.attributes, {});
  }

  async changeSubscription(id: string, newVariantId: string): Promise<BillingSubscription> {
    const body = { data: { type: "subscriptions", id, attributes: { variant_id: Number(newVariantId) } } };
    const json = await this.api<{ data: { id: string; attributes: LsSubAttributes } }>(`/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    return this.subFrom(id, json.data.attributes, {});
  }

  async createCustomerPortalUrl(customerId: string): Promise<string> {
    const json = await this.api<{ data: { attributes: { urls?: { customer_portal?: string } } } }>(`/customers/${customerId}`);
    const url = json.data.attributes.urls?.customer_portal;
    if (!url) throw new BillingError("No customer portal URL available", "NO_PORTAL");
    return url;
  }

  async refundOrder(): Promise<BillingRefund> {
    // Lemon Squeezy refunds are initiated in the dashboard and delivered via the
    // order_refunded webhook. We record refunds from the webhook, not an API call.
    throw new BillingUnsupportedError("refundOrder", this.id);
  }

  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    return constantTimeEqualHex(signature, hmacSha256Hex(rawBody, secret));
  }

  parseWebhookEvent(rawBody: string): BillingWebhookEvent {
    const p = JSON.parse(rawBody) as {
      meta: { event_name: string; custom_data?: Record<string, string> };
      data: { id: string; type: string; attributes: LsOrderAttributes & LsSubAttributes & { created_at?: string; updated_at?: string } };
    };
    const customData = p.meta.custom_data ?? {};
    const type = mapEventName(p.meta.event_name);
    // Lemon Squeezy has no universal event id in the payload → derive a
    // deterministic one from the immutable subject id + event name + timestamp.
    const stamp = p.data.attributes.updated_at ?? p.data.attributes.created_at ?? "";
    const providerEventId = `${p.meta.event_name}:${p.data.id}:${stamp}`;

    const event: BillingWebhookEvent = { providerEventId, providerEventName: p.meta.event_name, type, customData };
    if (p.data.type === "orders") event.order = this.orderFrom(p.data.id, p.data.attributes, customData);
    if (p.data.type === "subscriptions") event.subscription = this.subFrom(p.data.id, p.data.attributes, customData);
    if (type === "order_refunded" && p.data.type === "orders") {
      event.refund = {
        providerRefundId: null,
        amount: { amountMinorUnits: p.data.attributes.refunded_amount ?? p.data.attributes.total ?? 0, currencyCode: p.data.attributes.currency ?? "USD" },
        status: "succeeded",
      };
    }
    return event;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.api(`/stores/${this.config.storeId}`);
      return true;
    } catch {
      return false;
    }
  }

  private orderFrom(id: string, a: LsOrderAttributes, customData: Record<string, string>): BillingOrder {
    const currency = a.currency ?? "USD";
    const m = (n: number | undefined) => ({ amountMinorUnits: n ?? 0, currencyCode: currency });
    const status: BillingOrder["status"] = a.refunded ? "refunded" : a.status === "paid" ? "paid" : a.status === "failed" ? "failed" : "pending";
    return {
      providerOrderId: id,
      providerCustomerId: a.customer_id ? String(a.customer_id) : null,
      status,
      subtotal: m(a.subtotal),
      tax: m(a.tax),
      total: m(a.total),
      refunded: m(a.refunded_amount),
      purchasedAt: a.created_at ?? new Date(0).toISOString(),
      customData,
    };
  }

  private subFrom(id: string, a: LsSubAttributes, customData: Record<string, string>): BillingSubscription {
    return {
      providerSubscriptionId: id,
      providerCustomerId: a.customer_id ? String(a.customer_id) : null,
      status: mapSubStatus(a.status ?? ""),
      currentPeriodStart: a.created_at ?? null,
      currentPeriodEnd: a.renews_at ?? a.ends_at ?? null,
      cancelAtPeriodEnd: Boolean(a.cancelled) && a.status !== "expired",
      canceledAt: a.cancelled && a.ends_at ? a.ends_at : null,
      endedAt: a.status === "expired" ? a.ends_at ?? null : null,
      trialEndsAt: a.trial_ends_at ?? null,
      customData,
    };
  }
}

type LsOrderAttributes = {
  customer_id?: number | string;
  status?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  refunded?: boolean;
  refunded_amount?: number;
  currency?: string;
  created_at?: string;
};
type LsSubAttributes = {
  customer_id?: number | string;
  status?: string;
  cancelled?: boolean;
  renews_at?: string | null;
  ends_at?: string | null;
  trial_ends_at?: string | null;
  created_at?: string;
};
