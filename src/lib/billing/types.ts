/**
 * Provider-neutral billing domain (spec §1). The application depends ONLY on
 * these types + the BillingProvider interface — never on a provider SDK or on
 * provider-specific response shapes. Adapters normalize into these types.
 */

export const BILLING_PROVIDERS = ["lemon_squeezy", "mock", "manual", "future"] as const;
export type BillingProviderId = (typeof BILLING_PROVIDERS)[number];

export const BILLING_PRODUCT_TYPES = ["platform_premium", "creator_support", "paid_competitor_draft"] as const;
export type BillingProductType = (typeof BILLING_PRODUCT_TYPES)[number];

export const BILLING_INTERVALS = ["one_time", "monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** Money is always minor units + ISO currency; never floats. */
export type BillingMoney = { amountMinorUnits: number; currencyCode: string };

export type BillingProductReference = {
  productType: BillingProductType;
  providerProductId?: string | null;
  providerVariantId?: string | null;
};

export type BillingCheckoutStatus = "pending" | "open" | "completed" | "expired" | "failed";
export type BillingCheckout = {
  providerCheckoutId: string | null;
  url: string | null;
  status: BillingCheckoutStatus;
  expiresAt: string | null;
};

export type BillingCustomer = {
  providerCustomerId: string;
  email: string | null;
  name: string | null;
};

export type BillingOrderStatus = "paid" | "pending" | "partially_refunded" | "refunded" | "failed";
export type BillingOrder = {
  providerOrderId: string;
  providerCustomerId: string | null;
  status: BillingOrderStatus;
  subtotal: BillingMoney;
  tax: BillingMoney;
  total: BillingMoney;
  refunded: BillingMoney;
  purchasedAt: string;
  /** Internal identifiers we passed through checkout custom data. */
  customData: Record<string, string>;
};

/** Normalized subscription status (maps to the DB subscription_status enum). */
export type BillingSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";
export type BillingSubscription = {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  status: BillingSubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  trialEndsAt: string | null;
  customData: Record<string, string>;
};

export type BillingRefundStatus = "pending" | "succeeded" | "failed";
export type BillingRefund = {
  providerRefundId: string | null;
  amount: BillingMoney;
  status: BillingRefundStatus;
};

/** Normalized webhook event classes (spec §5). */
export const BILLING_EVENT_TYPES = [
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
  "unknown",
] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export type BillingWebhookEvent = {
  /** Stable provider event id (or a deterministic derived id). */
  providerEventId: string;
  /** Raw provider event name (e.g. Lemon Squeezy `meta.event_name`). */
  providerEventName: string;
  type: BillingEventType;
  /** Normalized subject if the event carries one. */
  order?: BillingOrder;
  subscription?: BillingSubscription;
  refund?: BillingRefund;
  customData: Record<string, string>;
};

export type CreateCheckoutInput = {
  /** Provider variant to purchase — resolved SERVER-SIDE, never from the client. */
  providerVariantId: string;
  /** Passed through the provider as custom data and echoed back on webhooks. */
  customData: Record<string, string>;
  customerEmail?: string | null;
  /** Allowlisted return URL. */
  redirectUrl: string;
  testMode: boolean;
};
