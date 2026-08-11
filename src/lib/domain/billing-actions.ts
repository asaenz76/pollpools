"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getBillingProvider, paidDraftCheckoutEnabled } from "@/lib/billing/index";
import { serverEnv } from "@/lib/env";
import { isValidTenantSlug } from "@/lib/tenant/resolver";
import { resolveTenantUrl } from "@/lib/tenant/urls";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { RpcArgs } from "@/types/rpc";

type Ok<T = object> = { ok: true } & T;
type Err = { ok: false; error: string };

const uuid = z.string().uuid();

/**
 * Server-derived checkout return URL — bound to the tenant's verified primary
 * custom domain when it has one, else the platform tenant URL. Never a client
 * value (prevents open redirects).
 */
function returnUrl(supabase: SupabaseClient<Database>, tenantSlug: string, status: string): Promise<string> {
  return resolveTenantUrl(supabase, tenantSlug, `/billing?status=${status}`);
}

const startSchema = z.object({
  productId: uuid,
  tenantSlug: z.string().refine(isValidTenantSlug),
  creatorId: uuid.optional(),
  competitionId: uuid.optional(),
  draftReservationId: uuid.optional(),
});

/**
 * Start a hosted checkout. Price, currency, variant, and eligibility are resolved
 * server-side; the client supplies only the product and optional creator/competition.
 */
export async function startCheckoutAction(input: z.infer<typeof startSchema>): Promise<Ok<{ url: string }> | Err> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: product } = await supabase
    .from("billing_products")
    .select("product_type, tenant_id, tenants!inner(slug)")
    .eq("id", parsed.data.productId)
    .maybeSingle();
  if (!product) return { ok: false, error: "Product not found." };
  const productSlug = Array.isArray(product.tenants) ? product.tenants[0]?.slug : product.tenants?.slug;
  if (productSlug !== parsed.data.tenantSlug) return { ok: false, error: "Product not available here." };

  // Paid Competitor Draft production gate (spec §0, §10).
  if (product.product_type === "paid_competitor_draft") {
    if (!paidDraftCheckoutEnabled()) return { ok: false, error: "Paid drafting is currently unavailable." };
    if (process.env.NODE_ENV === "production") {
      const admin = createAdminSupabase();
      const { data: approval } = await admin
        .from("provider_product_approvals")
        .select("id")
        .eq("provider", getBillingProvider().id)
        .eq("product_type", "paid_competitor_draft")
        .eq("approval_status", "approved")
        .limit(1)
        .maybeSingle();
      if (!approval) return { ok: false, error: "Paid drafting is pending provider approval." };
    }
  }

  const idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  const { data: co, error } = await supabase.rpc("create_billing_checkout", {
    p_billing_product_id: parsed.data.productId,
    p_idempotency_key: idempotencyKey,
    p_creator_id: parsed.data.creatorId ?? null,
    p_competition_id: parsed.data.competitionId ?? null,
    p_draft_reservation_id: parsed.data.draftReservationId ?? null,
  } as RpcArgs<"create_billing_checkout">);
  if (error) return { ok: false, error: "Couldn't start checkout." };

  const result = co as {
    checkout_id: string;
    checkout_url?: string;
    provider_variant_id: string | null;
    custom_data?: Record<string, unknown>;
  };
  if (result.checkout_url) return { ok: true, url: result.checkout_url }; // idempotent replay

  const provider = getBillingProvider();
  const customData: Record<string, string> = {};
  for (const [k, v] of Object.entries(result.custom_data ?? {})) customData[k] = String(v);

  const checkout = await provider.createCheckout({
    providerVariantId: result.provider_variant_id ?? "mock_variant",
    customData,
    customerEmail: user.email ?? null,
    redirectUrl: await returnUrl(supabase, parsed.data.tenantSlug, "pending"),
    testMode: serverEnv().LEMON_SQUEEZY_TEST_MODE,
  });
  if (!checkout.url) return { ok: false, error: "Checkout could not be created." };

  await supabase.rpc("set_billing_checkout_url", {
    p_checkout_id: result.checkout_id,
    p_provider_checkout_id: checkout.providerCheckoutId,
    p_url: checkout.url,
    p_expires_at: checkout.expiresAt,
  } as RpcArgs<"set_billing_checkout_url">);

  return { ok: true, url: checkout.url };
}

/** Cancel a subscription at period end. Provider is source of truth; webhook reconciles. */
export async function cancelSubscriptionAction(input: { subscriptionId: string }): Promise<Ok | Err> {
  const parsed = uuid.safeParse(input.subscriptionId);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: sub } = await supabase
    .from("billing_subscriptions")
    .select("id, provider_subscription_id")
    .eq("id", parsed.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sub) return { ok: false, error: "Subscription not found." };

  try {
    const provider = getBillingProvider();
    await provider.cancelSubscription(sub.provider_subscription_id);
  } catch {
    return { ok: false, error: "Couldn't cancel with the provider." };
  }
  // Reflect immediately (webhook will confirm); service role bypasses RLS.
  await createAdminSupabase().from("billing_subscriptions").update({ cancel_at_period_end: true, canceled_at: new Date().toISOString() }).eq("id", sub.id);
  return { ok: true };
}

/** Request a manual payout of available earnings. */
export async function requestPayoutAction(input: { creatorId: string; amountMinorUnits: number; currencyCode: string; method?: string; destinationMasked?: string }): Promise<Ok | Err> {
  const parsed = z
    .object({ creatorId: uuid, amountMinorUnits: z.number().int().positive(), currencyCode: z.string().length(3), method: z.string().max(60).optional(), destinationMasked: z.string().max(60).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const supabase = await createServerSupabase();
  const key =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const { data: creator } = await supabase.from("creators").select("tenant_id").eq("id", parsed.data.creatorId).maybeSingle();
  if (!creator) return { ok: false, error: "Creator not found." };
  const { error } = await supabase.from("creator_payout_requests").insert({
    tenant_id: creator.tenant_id,
    creator_id: parsed.data.creatorId,
    amount_minor_units: parsed.data.amountMinorUnits,
    currency_code: parsed.data.currencyCode,
    status: "requested",
    payout_method: parsed.data.method ?? null,
    payout_destination_masked: parsed.data.destinationMasked ?? null,
    idempotency_key: `payout-${key}`,
  });
  if (error) {
    if (error.message.includes("INSUFFICIENT_EARNINGS")) return { ok: false, error: "That's more than your available earnings." };
    if (error.message.includes("INVALID_AMOUNT")) return { ok: false, error: "Enter a payout amount greater than zero." };
    return { ok: false, error: "Couldn't request payout." };
  }
  return { ok: true };
}
