// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/** Architecture Review v2 hardening items 2, 3, 5, 9 (§12). */
d("phase 7.6 hardening", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let t1: string, t2: string;
  let creator1: string, creator2: string;
  let owner1: string, owner2: string;
  let buyer: string;
  let support1: string, support2: string;

  const apply = (event: Record<string, unknown>) =>
    admin.rpc("apply_billing_event", { p_webhook_id: randomUUID(), p_event: event } as never) as unknown as Rpc<unknown>;
  const money = (n: number) => ({ amountMinorUnits: n, currencyCode: "USD" });
  const supportOrder = (productId: string, creator: string, orderId: string, total: number) => ({
    type: "order_created",
    customData: { tenant_id: productId === support2 ? t2 : t1, user_id: buyer, internal_billing_product_id: productId, creator_id: creator },
    order: { providerOrderId: orderId, providerCustomerId: "c", status: "paid", subtotal: money(total), tax: money(0), total: money(total), refunded: money(0), purchasedAt: new Date().toISOString() },
  });
  const availableEarnings = async (creator: string) =>
    (await admin.from("creator_earnings").select("id, creator_share_minor_units, status").eq("creator_id", creator).eq("status", "available")).data ?? [];

  beforeAll(async () => {
    const mk = await admin.from("tenants").insert([{ slug: `hd1-${s}`, display_name: "H1" }, { slug: `hd2-${s}`, display_name: "H2" }]).select("id");
    t1 = mk.data![0]!.id; t2 = mk.data![1]!.id;
    await admin.from("tenant_settings").insert({ tenant_id: t1 }); // default 8000/2000
    await admin.from("tenant_settings").insert({ tenant_id: t2, platform_share_bps: 3000, creator_share_bps: 7000 }); // override

    buyer = await createUser(`hbuyer-${s}@example.test`, pw);
    owner1 = await createUser(`ho1-${s}@example.test`, pw);
    owner2 = await createUser(`ho2-${s}@example.test`, pw);
    for (const [t, u] of [[t1, buyer], [t1, owner1], [t2, owner2]] as const) await admin.from("tenant_memberships").insert({ tenant_id: t, user_id: u, role: "member" });

    const c1 = await admin.from("creators").insert({ tenant_id: t1, owner_user_id: owner1, display_name: "C1", slug: `c1-${s}`, verification_status: "verified" }).select("id").single();
    creator1 = c1.data!.id;
    const c2 = await admin.from("creators").insert({ tenant_id: t2, owner_user_id: owner2, display_name: "C2", slug: `c2-${s}`, verification_status: "verified" }).select("id").single();
    creator2 = c2.data!.id;

    const p1 = await admin.from("billing_products").insert({ tenant_id: t1, product_type: "creator_support", name: "S1", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 375, billing_interval: "monthly", creator_id: creator1 }).select("id").single();
    support1 = p1.data!.id;
    const p2 = await admin.from("billing_products").insert({ tenant_id: t2, product_type: "creator_support", name: "S2", provider: "mock", status: "active", currency_code: "USD", price_minor_units: 500, billing_interval: "monthly", creator_id: creator2 }).select("id").single();
    support2 = p2.data!.id;
  }, 60_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [t1, t2]);
    for (const u of [buyer, owner1, owner2]) if (u) await deleteUser(u);
  });

  // ── Item 2 — payout rejection releases reserved earnings (F-26) ─────────────
  it("payout rejection releases reserved earnings before deleting allocations", async () => {
    // Two 300-share earnings (375 * 0.8) for creator1.
    await apply(supportOrder(support1, creator1, `hd-e1-${s}`, 375));
    await apply(supportOrder(support1, creator1, `hd-e2-${s}`, 375));
    const before = await availableEarnings(creator1);
    expect(before).toHaveLength(2);

    // Two requests admitted while 600 is available (no allocations exist yet).
    const big = (await admin.from("creator_payout_requests").insert({ tenant_id: t1, creator_id: creator1, amount_minor_units: 600, currency_code: "USD", status: "requested", idempotency_key: `hd-big-${s}` }).select("id").single()).data!;
    const mid = (await admin.from("creator_payout_requests").insert({ tenant_id: t1, creator_id: creator1, amount_minor_units: 300, currency_code: "USD", status: "requested", idempotency_key: `hd-mid-${s}` }).select("id").single()).data!;

    // Approve the 300 first (holds one earning); the 600 then partially reserves
    // the other, finds it insufficient, and must RELEASE it (not leave it 'held').
    expect((await admin.rpc("approve_creator_payout", { p_payout_id: mid.id } as never)).error).toBeNull();
    const rejected = await admin.rpc("approve_creator_payout", { p_payout_id: big.id } as never);
    expect(rejected.error?.message).toContain("INSUFFICIENT_EARNINGS");

    // The 600 request left no allocations and is rejected; the earning it reserved
    // is available again; exactly one earning remains held (the 300 request's).
    const { count: bigAllocs } = await admin.from("creator_payout_allocations").select("*", { count: "exact", head: true }).eq("payout_request_id", big.id);
    expect(bigAllocs).toBe(0);
    // The INSUFFICIENT_EARNINGS raise rolls the approve txn back (the release is the
    // backstop), so the request is NOT approved and the reserved earning is restored.
    expect((await admin.from("creator_payout_requests").select("status").eq("id", big.id).single()).data!.status).not.toBe("approved");
    expect(await availableEarnings(creator1)).toHaveLength(1); // one released back to available
    const { count: held } = await admin.from("creator_earnings").select("*", { count: "exact", head: true }).eq("creator_id", creator1).eq("status", "held");
    expect(held).toBe(1);
  });

  // ── Item 3 — tenant and creator revenue-split overrides (F-11) ──────────────
  it("applies the tenant revenue-split override (70/30)", async () => {
    await apply(supportOrder(support2, creator2, `hd-tov-${s}`, 500));
    const oid = (await admin.from("billing_orders").select("id").eq("provider_order_id", `hd-tov-${s}`).single()).data!.id;
    const earning = (await admin.from("creator_earnings").select("creator_share_minor_units, platform_share_minor_units").eq("billing_order_id", oid).single()).data!;
    expect(earning).toMatchObject({ creator_share_minor_units: 350, platform_share_minor_units: 150 }); // 500 @ 70/30
  });

  it("a creator-specific revenue rule overrides the tenant split", async () => {
    await admin.from("creator_revenue_rules").insert({
      tenant_id: t2, creator_id: creator2, product_type: "creator_support",
      creator_share_basis_points: 6000, platform_share_basis_points: 4000, created_by: owner2,
    } as never);
    await apply(supportOrder(support2, creator2, `hd-cov-${s}`, 500));
    const oid = (await admin.from("billing_orders").select("id").eq("provider_order_id", `hd-cov-${s}`).single()).data!.id;
    const earning = (await admin.from("creator_earnings").select("creator_share_minor_units, platform_share_minor_units").eq("billing_order_id", oid).single()).data!;
    expect(earning).toMatchObject({ creator_share_minor_units: 300, platform_share_minor_units: 200 }); // 500 @ 60/40 (creator rule)
  });

  // ── Item 5 — public read tables stay tenant-bounded ─────────────────────────
  it("keeps public read-table (leaderboard_snapshots) queries bounded to their tenant", async () => {
    const sharedUser = await createUser(`hshared-${s}@example.test`, pw);
    try {
      const row = (tid: string, pts: number) => ({ tenant_id: tid, scope: "global" as const, scope_id: null, user_id: sharedUser, period: "all_time", rank: 1, total_points: pts, correct_predictions: pts, accuracy: 0, ranked: true });
      const ins = await admin.from("leaderboard_snapshots").insert([row(t1, 11), row(t2, 22)] as never);
      expect(ins.error).toBeNull();
      const t1Rows = (await admin.from("leaderboard_snapshots").select("total_points, tenant_id").eq("tenant_id", t1).eq("user_id", sharedUser)).data ?? [];
      expect(t1Rows).toHaveLength(1);
      expect(t1Rows[0]).toMatchObject({ tenant_id: t1, total_points: 11 }); // never t2's row
    } finally {
      await admin.from("leaderboard_snapshots").delete().eq("user_id", sharedUser);
      await deleteUser(sharedUser);
    }
  });

  // ── Item 9 — reconciliation rejects cross-tenant scopes (all scope types) ────
  it("reconcile rejects cross-tenant user / season / tenant scopes", async () => {
    const key = () => `hd-rec-${uniqueSuffix()}`;
    // A SEASON competition in t2 cannot be reconciled under t1.
    const season2 = (await admin.from("competitions").insert({ tenant_id: t2, creator_id: creator2, type: "SEASON", title: "Sn", slug: `sn-${s}`, status: "active" }).select("id").single()).data!;
    const crossSeason = await admin.rpc("reconcile", { p_tenant: t1, p_scope_type: "season", p_scope_id: season2.id, p_mode: "dry_run", p_idempotency_key: key() } as never);
    expect(crossSeason.error?.message).toContain("CROSS_TENANT_SCOPE");

    // owner2 belongs only to t2 → not reconcilable under t1.
    const crossUser = await admin.rpc("reconcile", { p_tenant: t1, p_scope_type: "user", p_scope_id: owner2, p_mode: "dry_run", p_idempotency_key: key() } as never);
    expect(crossUser.error?.message).toContain("CROSS_TENANT_SCOPE");

    // tenant scope with another tenant's id is rejected; own tenant is accepted.
    const crossTenant = await admin.rpc("reconcile", { p_tenant: t1, p_scope_type: "tenant", p_scope_id: t2, p_mode: "dry_run", p_idempotency_key: key() } as never);
    expect(crossTenant.error?.message).toContain("CROSS_TENANT_SCOPE");
    const ownTenant = await admin.rpc("reconcile", { p_tenant: t1, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: key() } as never);
    expect(ownTenant.error).toBeNull();
  });
});
