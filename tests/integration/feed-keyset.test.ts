// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Phase 8-C F-18 — feed keyset pagination. Exercises the exact query getFeed
 * runs: order by (created_at DESC, id DESC), cursor via a (created_at, id)
 * row-value comparison, no OFFSET. Proves no duplicate/missing rows across equal
 * timestamps, deterministic ordering, and tenant isolation.
 */
d("Feed keyset pagination (F-18)", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let otherTenant = "";

  // Replicate getFeed's keyset query with the admin client.
  async function page(cursor: { createdAt: string; id: string } | null, limit: number) {
    let q = admin.from("feed_activities").select("id, created_at").eq("tenant_id", tenantId);
    if (cursor) {
      q = q.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const { data } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    const all = data ?? [];
    const hasMore = all.length > limit;
    const rows = hasMore ? all.slice(0, limit) : all;
    const last = rows[rows.length - 1];
    return { rows, nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null };
  }
  async function walkAll(limit: number) {
    const ids: string[] = [];
    let cursor: { createdAt: string; id: string } | null = null;
    for (let guard = 0; guard < 100; guard++) {
      const p: { rows: { id: string }[]; nextCursor: { createdAt: string; id: string } | null } = await page(cursor, limit);
      ids.push(...p.rows.map((r) => r.id));
      if (!p.nextCursor) break;
      cursor = p.nextCursor;
    }
    return ids;
  }

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `fk-${s}`, display_name: "FK" } as never).select("id").single();
    tenantId = t!.id;
    const { data: o } = await admin.from("tenants").insert({ slug: `fk-other-${s}`, display_name: "Other" } as never).select("id").single();
    otherTenant = o!.id;

    // 25 rows. Deliberately reuse timestamps so many rows share an equal created_at
    // (the case that breaks LIMIT/OFFSET pagination).
    const base = new Date("2026-06-01T00:00:00Z").getTime();
    const rows = Array.from({ length: 25 }, (_, i) => ({
      tenant_id: tenantId,
      type: "user_submitted_prediction",
      created_at: new Date(base + Math.floor(i / 5) * 60_000).toISOString(), // 5 rows per timestamp
      dedupe_key: `fk-${s}-${i}-${randomUUID()}`,
    }));
    await admin.from("feed_activities").insert(rows as never);
    // Isolation noise in another tenant, same timestamps.
    await admin.from("feed_activities").insert(
      Array.from({ length: 5 }, (_, i) => ({ tenant_id: otherTenant, type: "user_submitted_prediction", created_at: new Date(base).toISOString(), dedupe_key: `fko-${s}-${i}-${randomUUID()}` })) as never,
    );
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenant]) if (id) await admin.from("tenants").delete().eq("id", id);
  });

  it("returns every row exactly once across pages (no duplicates, no skips) despite equal timestamps", async () => {
    const ids = await walkAll(7); // page size not a divisor of 25, crosses timestamp groups
    expect(ids.length).toBe(25);
    expect(new Set(ids).size).toBe(25); // no duplicates
  });

  it("produces a deterministic total order (created_at DESC, id DESC)", async () => {
    const first = await walkAll(7);
    const second = await walkAll(4); // different page size → identical order
    expect(second).toEqual(first);
  });

  it("keeps pagination tenant-isolated", async () => {
    const ids = await walkAll(10);
    const { data: mine } = await admin.from("feed_activities").select("id").eq("tenant_id", tenantId);
    expect(new Set(ids)).toEqual(new Set((mine ?? []).map((r) => r.id)));
    // None of the other tenant's rows leak in.
    const { data: theirs } = await admin.from("feed_activities").select("id").eq("tenant_id", otherTenant);
    for (const r of theirs ?? []) expect(ids).not.toContain(r.id);
  });

  it("advances strictly past the cursor even when the boundary timestamp has many rows", async () => {
    // First page of 3 lands inside a 5-row timestamp group; the next page must
    // continue with the remaining rows of that same timestamp, not repeat them.
    const p1 = await page(null, 3);
    const p2 = await page(p1.nextCursor, 3);
    const overlap = p1.rows.map((r) => r.id).filter((id) => p2.rows.some((r) => r.id === id));
    expect(overlap).toHaveLength(0);
  });
});
