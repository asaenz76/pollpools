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

const d = integrationEnvReady ? describe : describe.skip;

d("submit_prediction & market_sentiment", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let predictorId: string;
  let outsiderId: string;
  let predictor: SupabaseClient<Database>;
  let keyN = 0;
  const key = () => `idem-${s}-${keyN++}-abcdefgh`;

  const admin = adminClient();

  async function makeMarket(opts: {
    status?: "open" | "locked" | "draft";
    locksAt?: string | null;
  }): Promise<{ eventId: string; marketId: string; optionIds: string[] }> {
    const suffix = uniqueSuffix();
    const { data: ev, error: evErr } = await admin
      .from("events")
      .insert({
        tenant_id: tenantId,
        creator_id: creatorId,
        title: "Race",
        slug: `race-${suffix}`,
        status: opts.status === "draft" ? "draft" : "open",
        locks_at: opts.locksAt === undefined ? new Date(Date.now() + 3_600_000).toISOString() : opts.locksAt,
      })
      .select("id")
      .single();
    if (evErr) throw evErr;

    const { data: mkt, error: mErr } = await admin
      .from("markets")
      .insert({
        tenant_id: tenantId,
        event_id: ev.id,
        question: "Which competitor will win?",
        type: "SINGLE_CHOICE_WINNER",
        status: opts.status ?? "open",
        locks_at: opts.locksAt === undefined ? new Date(Date.now() + 3_600_000).toISOString() : opts.locksAt,
      })
      .select("id")
      .single();
    if (mErr) throw mErr;

    const { data: options, error: oErr } = await admin
      .from("market_options")
      .insert([
        { tenant_id: tenantId, market_id: mkt.id, label: "Alpha", display_order: 0 },
        { tenant_id: tenantId, market_id: mkt.id, label: "Beta", display_order: 1 },
        { tenant_id: tenantId, market_id: mkt.id, label: "Gamma", display_order: 2 },
      ])
      .select("id");
    if (oErr) throw oErr;

    return { eventId: ev.id, marketId: mkt.id, optionIds: options.map((o) => o.id) };
  }

  beforeAll(async () => {
    const { data: t, error: tErr } = await admin
      .from("tenants")
      .insert({ slug: `pred-${s}`, display_name: "Pred Tenant" })
      .select("id")
      .single();
    if (tErr) throw tErr;
    tenantId = t.id;
    await admin.from("tenant_settings").insert({ tenant_id: tenantId });

    ownerId = await createUser(`owner-${s}@example.test`, pw);
    predictorId = await createUser(`predictor-${s}@example.test`, pw);
    outsiderId = await createUser(`outsider-${s}@example.test`, pw);

    const { data: c, error: cErr } = await admin
      .from("creators")
      .insert({
        tenant_id: tenantId,
        owner_user_id: ownerId,
        display_name: "Owner Creator",
        slug: `owner-creator-${s}`,
        verification_status: "verified",
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    creatorId = c.id;

    // Predictor is an active member; outsider is not.
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: predictorId, role: "member" });

    predictor = await signInAs(`predictor-${s}@example.test`, pw);
  }, 30_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, predictorId, outsiderId]) if (id) await deleteUser(id);
  });

  it("submits a prediction and records one revision", async () => {
    const { marketId, optionIds } = await makeMarket({});
    const { data, error } = await predictor.rpc("submit_prediction", {
      p_market_id: marketId,
      p_option_id: optionIds[0]!,
      p_idempotency_key: key(),
    });
    expect(error).toBeNull();
    expect((data as { option_id: string }).option_id).toBe(optionIds[0]);

    const { count: predCount } = await admin
      .from("predictions")
      .select("*", { count: "exact", head: true })
      .eq("market_id", marketId);
    expect(predCount).toBe(1);

    const { count: revCount } = await admin
      .from("prediction_revisions")
      .select("*", { count: "exact", head: true })
      .eq("market_id", marketId);
    expect(revCount).toBe(1);
  });

  it("enforces one prediction per market (edit updates, not duplicates)", async () => {
    const { marketId, optionIds } = await makeMarket({});
    await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: key() });
    const { error } = await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[1]!, p_idempotency_key: key() });
    expect(error).toBeNull();

    const { data } = await admin.from("predictions").select("option_id, original_option_id").eq("market_id", marketId);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.option_id).toBe(optionIds[1]); // current updated
    expect(data?.[0]?.original_option_id).toBe(optionIds[0]); // original preserved
  });

  it("is idempotent for a repeated key", async () => {
    const { marketId, optionIds } = await makeMarket({});
    const k = key();
    const first = await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: k });
    const second = await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[1]!, p_idempotency_key: k });
    // Same key returns the original stored result; the second option is ignored.
    expect((second.data as { option_id: string }).option_id).toBe((first.data as { option_id: string }).option_id);
    const { data } = await admin.from("predictions").select("option_id").eq("market_id", marketId);
    expect(data?.[0]?.option_id).toBe(optionIds[0]);
  });

  it("rejects after server-time lock", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { marketId, optionIds } = await makeMarket({ locksAt: past });
    const { error } = await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: key() });
    expect(error?.message).toContain("MARKET_LOCKED");
  });

  it("rejects when the market is not open", async () => {
    const { marketId, optionIds } = await makeMarket({ status: "locked" });
    const { error } = await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: key() });
    expect(error?.message).toContain("MARKET_NOT_OPEN");
  });

  it("rejects an option from a different market", async () => {
    const a = await makeMarket({});
    const b = await makeMarket({});
    const { error } = await predictor.rpc("submit_prediction", { p_market_id: a.marketId, p_option_id: b.optionIds[0]!, p_idempotency_key: key() });
    expect(error?.message).toContain("INVALID_OPTION");
  });

  it("rejects a non-member", async () => {
    const outsider = await signInAs(`outsider-${s}@example.test`, pw);
    const { marketId, optionIds } = await makeMarket({});
    const { error } = await outsider.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: key() });
    expect(error?.message).toContain("NOT_A_MEMBER");
  });

  it("rejects a suspended account", async () => {
    const susEmail = `sus-${s}@example.test`;
    const susId = await createUser(susEmail, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: susId, role: "member" });
    await admin.from("users").update({ status: "suspended" }).eq("id", susId);
    const sus = await signInAs(susEmail, pw);
    const { marketId, optionIds } = await makeMarket({});
    const { error } = await sus.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: key() });
    expect(error?.message).toContain("ACCOUNT_NOT_ACTIVE");
    await deleteUser(susId);
  });

  it("blocks direct client insert into predictions (no write policy)", async () => {
    const { marketId, optionIds } = await makeMarket({});
    const { error } = await predictor.from("predictions").insert({
      tenant_id: tenantId,
      market_id: marketId,
      user_id: predictorId,
      option_id: optionIds[0]!,
      original_option_id: optionIds[0]!,
      idempotency_key: key(),
    });
    expect(error).not.toBeNull();
  });

  it("computes community sentiment across users", async () => {
    const { marketId, optionIds } = await makeMarket({});
    // predictor picks Alpha
    await predictor.rpc("submit_prediction", { p_market_id: marketId, p_option_id: optionIds[0]!, p_idempotency_key: key() });
    // add two more members who pick Alpha and Beta
    for (const label of ["a", "b"]) {
      const email = `s-${label}-${uniqueSuffix()}@example.test`;
      const uid = await createUser(email, pw);
      await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: uid, role: "member" });
      const c = await signInAs(email, pw);
      await c.rpc("submit_prediction", {
        p_market_id: marketId,
        p_option_id: label === "a" ? optionIds[0]! : optionIds[1]!,
        p_idempotency_key: key(),
      });
    }
    const { data } = await predictor.rpc("market_sentiment", { p_market_id: marketId });
    const rows = data as { option_id: string; votes: number; total: number }[];
    const byId = Object.fromEntries(rows.map((r) => [r.option_id, r.votes]));
    expect(byId[optionIds[0]!]).toBe(2); // Alpha
    expect(byId[optionIds[1]!]).toBe(1); // Beta
    expect(byId[optionIds[2]!]).toBe(0); // Gamma
    expect(rows[0]?.total).toBe(3);
  });
});
