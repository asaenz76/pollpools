import type { BillingProvider } from "./provider";
import { BillingUnsupportedError } from "./provider";
import type { BillingCheckout, BillingCustomer, BillingOrder, BillingSubscription, BillingRefund, BillingWebhookEvent } from "./types";

/**
 * Manual provider placeholder (spec §1). For records entered by hand (e.g.
 * sponsorships) — no hosted checkout, no webhooks. Consumer-billing operations
 * throw so callers must not route real purchases here.
 */
export class ManualBillingProvider implements BillingProvider {
  readonly id = "manual" as const;
  private no(op: string): never {
    throw new BillingUnsupportedError(op, this.id);
  }
  async createCheckout(): Promise<BillingCheckout> {
    return this.no("createCheckout");
  }
  async retrieveCheckout(): Promise<BillingCheckout> {
    return this.no("retrieveCheckout");
  }
  async retrieveCustomer(): Promise<BillingCustomer> {
    return this.no("retrieveCustomer");
  }
  async retrieveOrder(): Promise<BillingOrder> {
    return this.no("retrieveOrder");
  }
  async retrieveSubscription(): Promise<BillingSubscription> {
    return this.no("retrieveSubscription");
  }
  async cancelSubscription(): Promise<BillingSubscription> {
    return this.no("cancelSubscription");
  }
  async resumeSubscription(): Promise<BillingSubscription> {
    return this.no("resumeSubscription");
  }
  async changeSubscription(): Promise<BillingSubscription> {
    return this.no("changeSubscription");
  }
  async createCustomerPortalUrl(): Promise<string> {
    return this.no("createCustomerPortalUrl");
  }
  async refundOrder(): Promise<BillingRefund> {
    return this.no("refundOrder");
  }
  verifyWebhookSignature(): boolean {
    return false;
  }
  parseWebhookEvent(): BillingWebhookEvent {
    return this.no("parseWebhookEvent");
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}
