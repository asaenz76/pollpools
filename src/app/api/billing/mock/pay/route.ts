import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { MockBillingProvider } from "@/lib/billing/mock-provider";
import { billingWebhookSecret } from "@/lib/billing/index";
import { processBillingWebhook } from "@/lib/billing/webhook";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Mock hosted checkout completion (local/test only). Simulates the provider
 * charging the user and delivering VERIFIED webhooks, then redirects to the
 * success page. Real providers do this off-site; the pipeline is identical.
 *
 * This route can grant entitlements by self-signing webhooks, so it is hard
 * off-limits unless the mock provider is the configured one — a real provider
 * deployment (e.g. production on lemon_squeezy) can never reach it.
 */
export async function GET(request: NextRequest) {
  const home = `${publicEnv.NEXT_PUBLIC_APP_URL}/`;
  if (serverEnv().BILLING_PROVIDER !== "mock") return new NextResponse("Not found", { status: 404 });

  const checkoutId = request.nextUrl.searchParams.get("checkout_id") ?? "";
  if (!z.string().uuid().safeParse(checkoutId).success) return NextResponse.redirect(home);

  const admin = createAdminSupabase();
  const { data: checkout } = await admin
    .from("billing_checkouts")
    .select("id, tenant_id, user_id, billing_product_id, metadata, tenants(slug), billing_products(product_type, price_minor_units, currency_code, billing_interval, creator_id, competition_id)")
    .eq("id", checkoutId)
    .maybeSingle();
  if (!checkout) return NextResponse.redirect(home);

  const tenant = Array.isArray(checkout.tenants) ? checkout.tenants[0] : checkout.tenants;
  const product = Array.isArray(checkout.billing_products) ? checkout.billing_products[0] : checkout.billing_products;
  const slug = tenant?.slug ?? "";
  const meta = (checkout.metadata ?? {}) as Record<string, string>;
  const success = `${publicEnv.NEXT_PUBLIC_APP_URL}/t/${slug}/billing?status=success`;
  if (!product) return NextResponse.redirect(success);

  const customData: Record<string, string> = {
    tenant_id: checkout.tenant_id,
    user_id: checkout.user_id,
    internal_billing_product_id: checkout.billing_product_id,
    checkout_id: checkout.id,
  };
  if (meta.creator_id) customData.creator_id = meta.creator_id;
  if (meta.competition_id) customData.competition_id = meta.competition_id;
  if (meta.draft_reservation_id) customData.draft_reservation_id = meta.draft_reservation_id;

  const secret = billingWebhookSecret();
  const orderId = `mock_order_${checkout.id}`;
  const total = product.price_minor_units;
  const currency = product.currency_code;
  const recurring = product.billing_interval === "monthly" || product.billing_interval === "yearly";

  const deliver = async (body: string) => {
    await processBillingWebhook(body, MockBillingProvider.sign(body, secret));
  };

  // Order (payment) event.
  await deliver(
    MockBillingProvider.buildEvent({
      eventId: `mock_evt_order_${checkout.id}`,
      eventName: "order_created",
      customData,
      order: { id: orderId, customer_id: `mock_cust_${checkout.user_id}`, status: "paid", subtotal: total, tax: 0, total, refunded: 0, currency, purchased_at: new Date().toISOString() },
    }),
  );

  // Subscription event for recurring products.
  if (recurring) {
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await deliver(
      MockBillingProvider.buildEvent({
        eventId: `mock_evt_sub_${checkout.id}`,
        eventName: "subscription_created",
        customData,
        subscription: { id: `mock_sub_${checkout.id}`, customer_id: `mock_cust_${checkout.user_id}`, status: "active", current_period_start: new Date().toISOString(), current_period_end: periodEnd, cancel_at_period_end: false },
      }),
    );
  }

  return NextResponse.redirect(success);
}
