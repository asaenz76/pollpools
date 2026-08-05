import type {
  BillingProviderId,
  BillingCheckout,
  BillingCustomer,
  BillingOrder,
  BillingSubscription,
  BillingRefund,
  BillingWebhookEvent,
  CreateCheckoutInput,
} from "./types";

/**
 * Provider-neutral billing interface (spec §1). Adapters (Lemon Squeezy, mock,
 * manual) implement this. The domain layer depends on it — never on a provider
 * SDK. Provider-specific objects never escape the adapter.
 */
export interface BillingProvider {
  readonly id: BillingProviderId;

  createCheckout(input: CreateCheckoutInput): Promise<BillingCheckout>;
  retrieveCheckout(providerCheckoutId: string): Promise<BillingCheckout>;
  retrieveCustomer(providerCustomerId: string): Promise<BillingCustomer>;
  retrieveOrder(providerOrderId: string): Promise<BillingOrder>;
  retrieveSubscription(providerSubscriptionId: string): Promise<BillingSubscription>;
  cancelSubscription(providerSubscriptionId: string): Promise<BillingSubscription>;
  resumeSubscription(providerSubscriptionId: string): Promise<BillingSubscription>;
  changeSubscription(providerSubscriptionId: string, newVariantId: string): Promise<BillingSubscription>;
  createCustomerPortalUrl(providerCustomerId: string): Promise<string>;
  refundOrder(providerOrderId: string, amountMinorUnits?: number): Promise<BillingRefund>;

  /** Constant-time signature verification against the raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean;
  parseWebhookEvent(rawBody: string): BillingWebhookEvent;
  healthCheck(): Promise<boolean>;
}

export class BillingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "BillingError";
  }
}

export class BillingUnsupportedError extends BillingError {
  constructor(op: string, provider: string) {
    super(`${op} is not supported by the ${provider} billing provider`, "UNSUPPORTED");
    this.name = "BillingUnsupportedError";
  }
}
