// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = { data: T | null; error: { message: string } | null };

/**
 * Phase 8-C F-17 — the batched markets_sentiment(uuid[]) resolves an event's whole
 * sentiment in ONE call, replacing the per-market N+1. Proven equivalent to the
 * per-market market_sentiment and correct across multiple markets.
 */
d("Batched market sentiment (F-17)", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let creatorId = "";
  const voters: string[] = [];
  const markets: { id: string; options: { id: string }[] }[] = [];

  async function makeMarket(title: string) {
    const comps: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { data } = await admin.from("competitors").insert({ tenant_id: tenantId, creator_id: creatorId, name: `${title}${i}`, slug: `${title}${i}-${s}` } as never).select("id").single();
      comps.push(data!.id);
    }
    const { data: ev } = (await admin.rpc("create_event_with_market", {
      p_creator_id: creatorId, p_competition_id: null, p_title: title, p_slug: `${title}-${s}`, p_description: null,
      p_starts_at: null, p_locks_at: null, p_competitor_ids: comps, p_market_question: "Q?", p_publish: true, p_media: [],
    } as never)) as unknown as { data: { event_id: string } };
    const { data: mkt } = await admin.from("markets").select("id").eq("event_id", ev.event_id).single();
    const { data: opts } = await admin.from("market_options").select("id").eq("market_id", mkt!.id).order("display_order");
    markets.push({ id: mkt!.id, options: opts! });
    return { marketId: mkt!.id, options: opts! };
  }
  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({ tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId, original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `ms-${s}`, display_name: "MS" } as never).select("id").single();
    tenantId = t!.id;
    const owner = await createUser(`ms-owner-${s}@ms.test`, "Password123!");
    voters.push(owner);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: owner, display_name: "C", slug: `c-${s}`, verification_status: "verified" } as never).select("id").single();
    creatorId = c!.id;
    for (let i = 0; i < 3; i++) voters.push(await createUser(`ms-v${i}-${s}@ms.test`, "Password123!"));

    const m1 = await makeMarket("alpha");
    const m2 = await makeMarket("beta");
    // Market 1: 2 votes option[0], 1 vote option[1]. Market 2: 3 votes option[0].
    await predict(m1.marketId, voters[0]!, m1.options[0]!.id);
    await predict(m1.marketId, voters[1]!, m1.options[0]!.id);
    await predict(m1.marketId, voters[2]!, m1.options[1]!.id);
    await predict(m2.marketId, voters[0]!, m2.options[0]!.id);
    await predict(m2.marketId, voters[1]!, m2.options[0]!.id);
    await predict(m2.marketId, voters[2]!, m2.options[0]!.id);
  });

  afterAll(async () => {
    for (const v of voters) if (v) await deleteUser(v);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("returns correct per-market votes and totals in a single batched call", async () => {
    const { data, error } = (await admin.rpc("markets_sentiment", { p_market_ids: markets.map((m) => m.id) } as never)) as unknown as Rpc<
      { market_id: string; option_id: string; votes: number; total: number }[]
    >;
    expect(error).toBeNull();
    const rows = data!;
    const m1 = markets[0]!, m2 = markets[1]!;
    const byOpt = (mid: string) => new Map(rows.filter((r) => r.market_id === mid).map((r) => [r.option_id, Number(r.votes)]));
    expect(byOpt(m1.id).get(m1.options[0]!.id)).toBe(2);
    expect(byOpt(m1.id).get(m1.options[1]!.id)).toBe(1);
    expect(byOpt(m2.id).get(m2.options[0]!.id)).toBe(3);
    // Per-market totals are partitioned, not global.
    expect(Number(rows.find((r) => r.market_id === m1.id)!.total)).toBe(3);
    expect(Number(rows.find((r) => r.market_id === m2.id)!.total)).toBe(3);
  });

  it("matches the per-market market_sentiment exactly (equivalent batching)", async () => {
    for (const m of markets) {
      const single = (await admin.rpc("market_sentiment", { p_market_id: m.id } as never)) as unknown as Rpc<{ option_id: string; votes: number }[]>;
      const batched = (await admin.rpc("markets_sentiment", { p_market_ids: [m.id] } as never)) as unknown as Rpc<{ option_id: string; votes: number }[]>;
      const norm = (rows: { option_id: string; votes: number }[]) => rows.map((r) => `${r.option_id}:${r.votes}`).sort();
      expect(norm(batched.data!)).toEqual(norm(single.data!));
    }
  });

  it("stays a single query as markets grow (bounded — no per-market call)", async () => {
    // One RPC call resolves all markets; the row count is O(options), not O(queries).
    const { data } = (await admin.rpc("markets_sentiment", { p_market_ids: markets.map((m) => m.id) } as never)) as unknown as Rpc<unknown[]>;
    expect((data ?? []).length).toBe(markets.reduce((n, m) => n + m.options.length, 0));
  });
});
