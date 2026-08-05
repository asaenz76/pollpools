// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

d("creator: create_event_with_market", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let owner: SupabaseClient<Database>;
  let competitorIds: string[] = [];

  const createEvent = (client: SupabaseClient<Database>, opts: { title: string; slug: string; competitorIds: string[]; publish?: boolean }) =>
    client.rpc("create_event_with_market", {
      p_creator_id: creatorId,
      p_competition_id: null,
      p_title: opts.title,
      p_slug: opts.slug,
      p_description: null,
      p_starts_at: null,
      p_locks_at: null,
      p_youtube_url: null,
      p_competitor_ids: opts.competitorIds,
      p_market_question: null,
      p_publish: opts.publish ?? true,
    } as never) as unknown as Rpc<{ event_id: string; slug: string }>;

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `cr-${s}`, display_name: "Creator" }).select("id").single();
    tenantId = t!.id;
    ownerId = await createUser(`owner-${s}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "creator" });
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
    const { data: comps } = await admin.from("competitors").insert([
      { tenant_id: tenantId, creator_id: creatorId, name: "Alpha", slug: `alpha-${s}`, color: "#ef4444" },
      { tenant_id: tenantId, creator_id: creatorId, name: "Beta", slug: `beta-${s}`, color: "#3b82f6" },
      { tenant_id: tenantId, creator_id: creatorId, name: "Gamma", slug: `gamma-${s}` },
    ]).select("id");
    competitorIds = comps!.map((x) => x.id);
    owner = await signInAs(`owner-${s}@example.test`, pw);
  }, 30_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    if (ownerId) await deleteUser(ownerId);
  });

  it("creates an event with a market and competitor-mapped options", async () => {
    const { data, error } = await createEvent(owner, { title: "Race 1", slug: `race-1-${s}`, competitorIds: competitorIds.slice(0, 3) });
    expect(error).toBeNull();
    const eventId = data!.event_id;

    const { data: event } = await admin.from("events").select("status, competition_id").eq("id", eventId).single();
    expect(event!.status).toBe("open");

    const { data: market } = await admin.from("markets").select("id, status, type").eq("event_id", eventId).single();
    expect(market!.status).toBe("open");
    expect(market!.type).toBe("SINGLE_CHOICE_WINNER");

    const { data: options } = await admin.from("market_options").select("label, competitor_id, color").eq("market_id", market!.id);
    expect(options).toHaveLength(3);
    expect(options!.map((o) => o.label).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(options!.every((o) => o.competitor_id)).toBe(true);

    const { count } = await admin.from("event_competitors").select("*", { count: "exact", head: true }).eq("event_id", eventId);
    expect(count).toBe(3);
  });

  it("rejects fewer than two competitors", async () => {
    const { error } = await createEvent(owner, { title: "Solo", slug: `solo-${s}`, competitorIds: [competitorIds[0]!] });
    expect(error?.message).toContain("NEED_TWO_COMPETITORS");
  });

  it("rejects a non-owner", async () => {
    const otherEmail = `other-${s}@example.test`;
    const otherId = await createUser(otherEmail, pw);
    const other = await signInAs(otherEmail, pw);
    const { error } = await createEvent(other, { title: "Sneaky", slug: `sneaky-${s}`, competitorIds: competitorIds.slice(0, 2) });
    expect(error?.message).toContain("NOT_AUTHORIZED");
    await deleteUser(otherId);
  });

  it("creates a draft (unpublished) event when publish=false", async () => {
    const { data } = await createEvent(owner, { title: "Draft", slug: `draft-${s}`, competitorIds: competitorIds.slice(0, 2), publish: false });
    const { data: event } = await admin.from("events").select("status").eq("id", data!.event_id).single();
    expect(event!.status).toBe("draft");
  });

  it("the owner can add competitors and a competition via RLS; a non-owner cannot", async () => {
    // Path used by addCompetitorAction / createCompetitionAction.
    const add = await owner.from("competitors").insert({ tenant_id: tenantId, creator_id: creatorId, name: "Delta", slug: `delta-${s}` });
    expect(add.error).toBeNull();
    const comp = await owner.from("competitions").insert({ tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "S1", slug: `s1-${s}`, status: "active" });
    expect(comp.error).toBeNull();
  });

  it("a non-owner cannot add competitors to someone else's creator", async () => {
    const email = `intruder-${s}@example.test`;
    const id = await createUser(email, pw);
    const intruder = await signInAs(email, pw);
    const { error } = await intruder.from("competitors").insert({ tenant_id: tenantId, creator_id: creatorId, name: "Hack", slug: `hack-${s}` });
    expect(error).not.toBeNull();
    await deleteUser(id);
  });
});
