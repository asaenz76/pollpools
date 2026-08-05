import "server-only";

import { serverEnv } from "@/lib/env";
import { MockBillingProvider } from "./mock-provider";
import { LemonSqueezyBillingProvider } from "./lemon-squeezy-provider";
import { ManualBillingProvider } from "./manual-provider";
import type { BillingProvider } from "./provider";
import type { BillingProductType } from "./types";

/** Resolve the configured billing provider (server-only). */
export function getBillingProvider(): BillingProvider {
  const env = serverEnv();
  switch (env.BILLING_PROVIDER) {
    case "lemon_squeezy": {
      if (!env.LEMON_SQUEEZY_API_KEY || !env.LEMON_SQUEEZY_STORE_ID || !env.LEMON_SQUEEZY_WEBHOOK_SECRET) {
        throw new Error("BILLING_PROVIDER=lemon_squeezy but its API key / store id / webhook secret are not configured");
      }
      return new LemonSqueezyBillingProvider({
        apiKey: env.LEMON_SQUEEZY_API_KEY,
        storeId: env.LEMON_SQUEEZY_STORE_ID,
        webhookSecret: env.LEMON_SQUEEZY_WEBHOOK_SECRET,
        testMode: env.LEMON_SQUEEZY_TEST_MODE,
      });
    }
    case "manual":
      return new ManualBillingProvider();
    default:
      return new MockBillingProvider();
  }
}

/** The secret used to verify inbound webhook signatures for the active provider. */
export function billingWebhookSecret(): string {
  const env = serverEnv();
  if (env.BILLING_PROVIDER === "lemon_squeezy") return env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? "";
  return env.BILLING_WEBHOOK_SECRET;
}

export function paidDraftCheckoutEnabled(): boolean {
  return serverEnv().PAID_DRAFT_CHECKOUT_ENABLED;
}

/**
 * Provider variant id for a product type from env, used as a fallback when a
 * `billing_products` row has no `provider_variant_id`. Always resolved server-
 * side — the client never supplies a variant/price.
 */
export function envVariantId(productType: BillingProductType): string | null {
  const env = serverEnv();
  switch (productType) {
    case "platform_premium":
      return env.LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID ?? null;
    case "creator_support":
      return env.LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID ?? null;
    case "paid_competitor_draft":
      return env.LEMON_SQUEEZY_PAID_DRAFT_VARIANT_ID ?? null;
  }
}
