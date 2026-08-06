// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Generic event media (§3–§9): DB-level tenant + ownership isolation on
 * event_media_links, and confirmation that legacy YouTube URLs were migrated.
 */
d("event media links: isolation & migration", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string, tenant2Id: string;
  let creatorA: string;
  let userA: string, userB: string, userC: string;
  let ownerA: SupabaseClient<Database>, ownerB: SupabaseClient<Database>, ownerC: SupabaseClient<Database>;
  let publishedEvent: string, draftEvent: string;

  const mediaRow = (eventId: string, tid = tenantId) => ({
    tenant_id: tid, event_id: eventId, provider: "external", media_type: "livestream" as const,
    url: "https://example.com/stream", is_primary: false,
  });

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `em-${s}`, display_name: "EM" }).select("id").single();
    tenantId = t!.id;
    const { data: t2 } = await admin.from("tenants").insert({ slug: `em2-${s}`, display_name: "EM2" }).select("id").single();
    tenant2Id = t2!.id;

    userA = await createUser(`ema-${s}@example.test`, pw);
    userB = await createUser(`emb-${s}@example.test`, pw);
    userC = await createUser(`emc-${s}@example.test`, pw);
    const { data: cA } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: userA, display_name: "A", slug: `a-${s}`, verification_status: "verified" }).select("id").single();
    creatorA = cA!.id;
    await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: userB, display_name: "B", slug: `b-${s}`, verification_status: "verified" });
    await admin.from("creators").insert({ tenant_id: tenant2Id, owner_user_id: userC, display_name: "C", slug: `c-${s}`, verification_status: "verified" });

    const { data: comps } = await admin.from("competitors").insert([
      { tenant_id: tenantId, creator_id: creatorA, name: "Alpha", slug: `al-${s}` },
      { tenant_id: tenantId, creator_id: creatorA, name: "Beta", slug: `be-${s}` },
    ]).select("id");
    const cids = comps!.map((c) => c.id);

    ownerA = await signInAs(`ema-${s}@example.test`, pw);
    ownerB = await signInAs(`emb-${s}@example.test`, pw);
    ownerC = await signInAs(`emc-${s}@example.test`, pw);

    const mk = async (slug: string, publish: boolean) => {
      const { data } = await (ownerA.rpc("create_event_with_market", {
        p_creator_id: creatorA, p_competition_id: null, p_title: slug, p_slug: slug, p_description: null,
        p_starts_at: null, p_locks_at: null, p_competitor_ids: cids, p_market_question: null, p_publish: publish, p_media: [],
      } as never) as unknown as Promise<{ data: { event_id: string } | null }>);
      return data!.event_id;
    };
    publishedEvent = await mk(`pub-${s}`, true);
    draftEvent = await mk(`draft-${s}`, false);
  }, 60_000);

  afterAll(async () => {
    await admin.from("tenants").delete().in("id", [tenantId, tenant2Id]);
    for (const id of [userA, userB, userC]) if (id) await deleteUser(id);
  });

  it("lets the event's creator owner attach media", async () => {
    const { error } = await ownerA.from("event_media_links").insert(mediaRow(publishedEvent));
    expect(error).toBeNull();
  });

  it("blocks another creator (same tenant) from writing media to an event they don't own", async () => {
    const { error } = await ownerB.from("event_media_links").insert(mediaRow(publishedEvent));
    expect(error).not.toBeNull();
  });

  it("blocks a creator in another tenant from writing media (cross-tenant)", async () => {
    const { error } = await ownerC.from("event_media_links").insert(mediaRow(publishedEvent, tenant2Id));
    expect(error).not.toBeNull();
  });

  it("makes a published event's media world-readable but keeps draft media owner-only", async () => {
    await ownerA.from("event_media_links").insert(mediaRow(draftEvent));
    // Published media is visible to another user.
    const pub = await ownerB.from("event_media_links").select("id").eq("event_id", publishedEvent);
    expect((pub.data ?? []).length).toBeGreaterThanOrEqual(1);
    // Draft media is hidden from a non-owner but visible to the owner.
    const draftAsOther = await ownerB.from("event_media_links").select("id").eq("event_id", draftEvent);
    expect(draftAsOther.data ?? []).toHaveLength(0);
    const draftAsOwner = await ownerA.from("event_media_links").select("id").eq("event_id", draftEvent);
    expect((draftAsOwner.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("rejects an empty media url at the database (check constraint)", async () => {
    const { error } = await ownerA.from("event_media_links").insert({ ...mediaRow(publishedEvent), url: "   " });
    expect(error).not.toBeNull();
  });

  it("migrated every legacy youtube_url into a primary media row (§8)", async () => {
    // Any event still carrying a legacy youtube_url must have a corresponding media row.
    const { data: legacy } = await admin.from("events").select("id").not("youtube_url", "is", null);
    for (const e of legacy ?? []) {
      const { count } = await admin.from("event_media_links").select("*", { count: "exact", head: true }).eq("event_id", e.id).eq("provider", "youtube");
      expect(count, `event ${e.id} legacy youtube_url not migrated`).toBeGreaterThanOrEqual(1);
    }
  });
});
