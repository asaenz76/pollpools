// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  adminClient,
  createUser,
  signInAs,
  deleteUser,
  uniqueSuffix,
  integrationEnvReady,
} from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Tenant-isolation + privilege-escalation RLS tests. These prove the deny-by-
 * default posture: a member of tenant A cannot read tenant B's private data,
 * cannot self-grant super_admin, and cannot self-verify a creator.
 *
 * Requires a running local Supabase (`npm run db:start`). Skips cleanly otherwise.
 */
const d = integrationEnvReady ? describe : describe.skip;

d("RLS: tenant isolation & privilege gates", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const emailA = `alice-${s}@example.test`;
  const emailB = `bob-${s}@example.test`;

  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;
  let creatorA: string;
  let clientA: SupabaseClient<Database>;

  beforeAll(async () => {
    const admin = adminClient();

    // Two tenants.
    const { data: tA, error: eA } = await admin
      .from("tenants")
      .insert({ slug: `tenant-a-${s}`, display_name: "Tenant A" })
      .select("id")
      .single();
    if (eA) throw eA;
    tenantA = tA.id;

    const { data: tB, error: eB } = await admin
      .from("tenants")
      .insert({ slug: `tenant-b-${s}`, display_name: "Tenant B" })
      .select("id")
      .single();
    if (eB) throw eB;
    tenantB = tB.id;

    // Settings rows so cross-tenant update attempts hit a real, protected row.
    const { error: sErr } = await admin.from("tenant_settings").insert([
      { tenant_id: tenantA },
      { tenant_id: tenantB },
    ]);
    if (sErr) throw sErr;

    // Two users (auth trigger mirrors them into public.users).
    userA = await createUser(emailA, pw);
    userB = await createUser(emailB, pw);

    // Memberships: A→tenantA, B→tenantB.
    const { error: mErr } = await admin.from("tenant_memberships").insert([
      { tenant_id: tenantA, user_id: userA, role: "member" },
      { tenant_id: tenantB, user_id: userB, role: "member" },
    ]);
    if (mErr) throw mErr;

    // Profiles: A public, B private.
    const { error: pErr } = await admin.from("profiles").insert([
      { tenant_id: tenantA, user_id: userA, handle: `alice_${s}`.slice(0, 30), display_name: "Alice", is_public: true },
      { tenant_id: tenantB, user_id: userB, handle: `bob_${s}`.slice(0, 30), display_name: "Bob", is_public: false },
    ]);
    if (pErr) throw pErr;

    // A creator owned by user A, pending verification.
    const { data: cA, error: cErr } = await admin
      .from("creators")
      .insert({
        tenant_id: tenantA,
        owner_user_id: userA,
        display_name: "Alice Races",
        slug: `alice-races-${s}`,
        verification_status: "pending",
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    creatorA = cA.id;

    clientA = await signInAs(emailA, pw);
  }, 30_000);

  afterAll(async () => {
    const admin = adminClient();
    await admin.from("tenants").delete().in("id", [tenantA, tenantB]);
    if (userA) await deleteUser(userA);
    if (userB) await deleteUser(userB);
  });

  it("a member sees only their own membership, not another tenant's", async () => {
    const { data, error } = await clientA.from("tenant_memberships").select("id, tenant_id, user_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.tenant_id).toBe(tenantA);
    expect(data?.[0]?.user_id).toBe(userA);
  });

  it("cannot read another user's private profile", async () => {
    const { data } = await clientA.from("profiles").select("id, user_id").eq("tenant_id", tenantB);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot self-grant super_admin (privilege escalation blocked)", async () => {
    const { error } = await clientA.from("user_roles").insert({ user_id: userA, role: "super_admin" });
    expect(error).not.toBeNull();
    // And it genuinely did not land.
    const { data } = await adminClient().from("user_roles").select("id").eq("user_id", userA);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot modify another tenant's settings", async () => {
    const { data } = await clientA
      .from("tenant_settings")
      .update({ minimum_ranked_predictions: 1 })
      .eq("tenant_id", tenantB)
      .select("tenant_id");
    // Either denied outright or matches zero rows — never actually updates.
    expect(data ?? []).toHaveLength(0);
  });

  it("owner cannot self-verify their creator", async () => {
    const { error } = await clientA
      .from("creators")
      .update({ verification_status: "verified" })
      .eq("id", creatorA);
    expect(error).not.toBeNull();
    // Confirm it stayed pending.
    const { data } = await adminClient().from("creators").select("verification_status").eq("id", creatorA).single();
    expect(data?.verification_status).toBe("pending");
  });

  it("owner cannot self-grant settlement permission", async () => {
    const { error } = await clientA
      .from("creators")
      .update({ settlement_enabled: true })
      .eq("id", creatorA);
    expect(error).not.toBeNull();
    const { data } = await adminClient().from("creators").select("settlement_enabled").eq("id", creatorA).single();
    expect(data?.settlement_enabled).toBe(false);
  });

  it("owner CAN update non-privileged creator fields", async () => {
    const { error } = await clientA
      .from("creators")
      .update({ description: "Updated bio" })
      .eq("id", creatorA);
    expect(error).toBeNull();
  });

  it("cannot read the idempotency ledger (service-role only)", async () => {
    const { data } = await clientA.from("idempotency_records").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
