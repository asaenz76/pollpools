import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

/** Active entitlements for the current user (spec §6/§7). Memoized per request. */
export const getEntitlements = cache(async (tenantId: string) => {
  const user = await getSessionUser();
  if (!user) return { premium: false, supportedCreatorIds: [] as string[] };
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("billing_entitlements")
    .select("entitlement_type, creator_id, ends_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .eq("status", "active");
  const now = Date.now();
  const active = (data ?? []).filter((e) => !e.ends_at || new Date(e.ends_at).getTime() > now);
  return {
    premium: active.some((e) => e.entitlement_type === "platform_premium"),
    supportedCreatorIds: active.filter((e) => e.entitlement_type === "creator_supporter" && e.creator_id).map((e) => e.creator_id as string),
  };
});

export type BillingProductView = { id: string; name: string; description: string | null; priceMinorUnits: number; currencyCode: string; interval: string | null };

export async function getPremiumProduct(tenantId: string): Promise<BillingProductView | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("billing_products")
    .select("id, name, description, price_minor_units, currency_code, billing_interval")
    .eq("tenant_id", tenantId)
    .eq("product_type", "platform_premium")
    .eq("status", "active")
    .maybeSingle();
  return data ? { id: data.id, name: data.name, description: data.description, priceMinorUnits: data.price_minor_units, currencyCode: data.currency_code, interval: data.billing_interval } : null;
}

export async function getCreatorSupportProduct(tenantId: string, creatorId: string): Promise<BillingProductView | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("billing_products")
    .select("id, name, description, price_minor_units, currency_code, billing_interval")
    .eq("tenant_id", tenantId)
    .eq("product_type", "creator_support")
    .eq("creator_id", creatorId)
    .eq("status", "active")
    .maybeSingle();
  return data ? { id: data.id, name: data.name, description: data.description, priceMinorUnits: data.price_minor_units, currencyCode: data.currency_code, interval: data.billing_interval } : null;
}

export type BillingOverview = {
  subscriptions: { id: string; kind: "premium" | "support"; creatorName: string | null; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }[];
  orders: { id: string; description: string; totalMinorUnits: number; currencyCode: string; status: string; purchasedAt: string }[];
};

export async function getBillingOverview(tenantId: string): Promise<BillingOverview | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createServerSupabase();

  const [{ data: subs }, { data: orders }] = await Promise.all([
    supabase
      .from("billing_subscriptions")
      .select("id, status, current_period_end, cancel_at_period_end, creator_id, billing_products(product_type), creators(display_name)")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("billing_orders")
      .select("id, total_minor_units, currency_code, status, purchased_at, billing_products(name)")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .order("purchased_at", { ascending: false })
      .limit(20),
  ]);

  return {
    subscriptions: (subs ?? []).map((sub) => {
      const prod = Array.isArray(sub.billing_products) ? sub.billing_products[0] : sub.billing_products;
      const creator = Array.isArray(sub.creators) ? sub.creators[0] : sub.creators;
      return {
        id: sub.id,
        kind: prod?.product_type === "creator_support" ? "support" : "premium",
        creatorName: creator?.display_name ?? null,
        status: sub.status,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    }),
    orders: (orders ?? []).map((o) => {
      const prod = Array.isArray(o.billing_products) ? o.billing_products[0] : o.billing_products;
      return { id: o.id, description: prod?.name ?? "Order", totalMinorUnits: o.total_minor_units, currencyCode: o.currency_code, status: o.status, purchasedAt: o.purchased_at };
    }),
  };
}

export type CreatorRevenue = {
  availableMinorUnits: number;
  pendingMinorUnits: number;
  paidMinorUnits: number;
  currencyCode: string;
  payouts: { id: string; amountMinorUnits: number; currencyCode: string; status: string; requestedAt: string }[];
};

export async function getCreatorRevenue(tenantId: string, creatorId: string): Promise<CreatorRevenue> {
  const supabase = await createServerSupabase();
  const { data: earnings } = await supabase
    .from("creator_earnings")
    .select("creator_share_minor_units, status, currency_code")
    .eq("tenant_id", tenantId)
    .eq("creator_id", creatorId);

  let available = 0, pending = 0, paid = 0, currency = "USD";
  for (const e of earnings ?? []) {
    currency = e.currency_code;
    if (e.status === "available") available += e.creator_share_minor_units;
    else if (e.status === "pending" || e.status === "held") pending += e.creator_share_minor_units;
    else if (e.status === "paid") paid += e.creator_share_minor_units;
  }

  const { data: payouts } = await supabase
    .from("creator_payout_requests")
    .select("id, amount_minor_units, currency_code, status, requested_at")
    .eq("tenant_id", tenantId)
    .eq("creator_id", creatorId)
    .order("requested_at", { ascending: false })
    .limit(20);

  return {
    availableMinorUnits: available,
    pendingMinorUnits: pending,
    paidMinorUnits: paid,
    currencyCode: currency,
    payouts: (payouts ?? []).map((p) => ({ id: p.id, amountMinorUnits: p.amount_minor_units, currencyCode: p.currency_code, status: p.status, requestedAt: p.requested_at })),
  };
}

/** Format minor units as a currency string. */
export function formatMoney(minorUnits: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(minorUnits / 100);
}
