// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type RpcInt = Promise<{ data: number | null; error: { message: string } | null }>;

/**
 * Phase 8-B.5 GRE.2 — WAU is set-based, configurable, and deterministic. Tested
 * through the login-activity signal (the new mechanism), covering distinct
 * counting, the minimum-actions threshold, window boundaries, and signal toggles.
 */
d("WAU measurement", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  const users: string[] = [];

  // Fixed reference points so the test is independent of wall-clock/day.
  const asOf = new Date("2026-06-15T00:00:00Z");
  const from = new Date("2026-06-08T00:00:00Z"); // asOf - 7d
  const prevFrom = new Date("2026-06-01T00:00:00Z");

  const wau = (fromT: Date, toT: Date, min = 1, pred = true, draft = true, login = true) =>
    admin.rpc("tenant_wau_at" as never, {
      p_tenant: tenantId, p_from: fromT.toISOString(), p_to: toT.toISOString(),
      p_min_actions: min, p_sig_pred: pred, p_sig_draft: draft, p_sig_login: login,
    } as never) as unknown as RpcInt;

  const activity = (user: string, date: string, count = 1) =>
    admin.from("tenant_user_activity").insert({ tenant_id: tenantId, user_id: user, activity_date: date, action_count: count } as never);

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `wau-${s}`, display_name: "WAU" } as never).select("id").single();
    tenantId = t!.id;
    for (let i = 0; i < 4; i++) users.push(await createUser(`wau${i}-${s}@wau.test`, "Password123!"));

    // Current window (Jun 8–15): users 0,1,2 active; user 0 active on two days.
    await activity(users[0]!, "2026-06-09");
    await activity(users[0]!, "2026-06-11");
    await activity(users[1]!, "2026-06-10");
    await activity(users[2]!, "2026-06-12");
    // Previous window (Jun 1–8): users 0,1 active.
    await activity(users[0]!, "2026-06-03");
    await activity(users[1]!, "2026-06-05");
  });

  afterAll(async () => {
    for (const u of users) if (u) await deleteUser(u);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("counts distinct active users in the window", async () => {
    const { data } = await wau(from, asOf);
    expect(data).toBe(3); // users 0,1,2 (user 0's two days count once)
  });

  it("computes the previous window independently", async () => {
    const { data } = await wau(prevFrom, from);
    expect(data).toBe(2); // users 0,1
  });

  it("applies the minimum-actions threshold", async () => {
    // Only user 0 has >= 2 actions (two days) in the current window.
    const { data } = await wau(from, asOf, 2);
    expect(data).toBe(1);
  });

  it("drops a signal when it is toggled off", async () => {
    // With the login signal off (and no predictions/drafts seeded), WAU is 0.
    const { data } = await wau(from, asOf, 1, true, true, false);
    expect(data).toBe(0);
  });

  it("current + previous via the configured public wrapper", async () => {
    const { data } = await admin
      .rpc("tenant_wau_current" as never, { p_tenant: tenantId, p_as_of: asOf.toISOString() } as never)
      .single();
    const row = data as { current_wau: number; previous_wau: number; window_days: number };
    expect(row.window_days).toBe(7);
    expect(row.current_wau).toBe(3);
    expect(row.previous_wau).toBe(2);
  });
});
