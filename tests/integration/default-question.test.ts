// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, signInAs, uniqueSuffix, integrationEnvReady } from "./helpers";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = { data: T | null; error: { message: string } | null };

/**
 * Phase 8-C F-21 — the default market question is derived from the tenant's
 * vocabulary, not a hard-coded English literal. Two tenants with different
 * competitor vocabularies produce different default questions with NO code change
 * (exercising the SQL fallback via create_event_with_market with an empty question).
 */
d("Default market question from vocabulary (F-21)", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  const tenants: { id: string; slug: string; owner: string; creatorId: string; comps: string[] }[] = [];

  async function makeTenant(slug: string, competitorSingular: string) {
    const { data: t } = await admin.from("tenants").insert({ slug: `${slug}-${s}`, display_name: slug } as never).select("id").single();
    await admin.from("tenant_settings").insert({ tenant_id: t!.id, vocabulary: { competitor: { singular: competitorSingular } } } as never);
    const owner = await createUser(`${slug}-${s}@dq.test`, "Password123!");
    await admin.from("tenant_memberships").insert({ tenant_id: t!.id, user_id: owner, role: "creator", status: "active" } as never);
    const { data: c } = await admin.from("creators").insert({ tenant_id: t!.id, owner_user_id: owner, display_name: "C", slug: `c-${slug}-${s}`, verification_status: "verified" } as never).select("id").single();
    const comps: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { data: cp } = await admin.from("competitors").insert({ tenant_id: t!.id, creator_id: c!.id, name: `X${i}`, slug: `x${i}-${slug}-${s}` } as never).select("id").single();
      comps.push(cp!.id);
    }
    tenants.push({ id: t!.id, slug: `${slug}-${s}`, owner, creatorId: c!.id, comps });
    return tenants[tenants.length - 1]!;
  }

  beforeAll(async () => {
    await makeTenant("chefs", "Chef");
    await makeTenant("racers", "Racer");
  });

  afterAll(async () => {
    for (const t of tenants) {
      await deleteUser(t.owner);
      await admin.from("tenants").delete().eq("id", t.id);
    }
  });

  async function defaultQuestionFor(t: (typeof tenants)[number]) {
    // Create an event with an EMPTY question as the tenant owner → the DB fallback
    // (vocabulary-derived) fills it. Sign in so create_event_with_market authorizes.
    const client = await signInAs(`${t.slug.split("-")[0]}-${s}@dq.test`, "Password123!");
    const { error } = (await client.rpc("create_event_with_market", {
      p_creator_id: t.creatorId, p_competition_id: null, p_title: "E", p_slug: `e-${t.slug}`, p_description: null,
      p_starts_at: null, p_locks_at: null, p_competitor_ids: t.comps, p_market_question: "", p_publish: true, p_media: [],
    } as never)) as unknown as Rpc<unknown>;
    expect(error).toBeNull();
    const { data: ev } = await admin.from("events").select("id").eq("tenant_id", t.id).eq("slug", `e-${t.slug}`).single();
    const { data: mkt } = await admin.from("markets").select("question").eq("event_id", ev!.id).single();
    return mkt!.question as string;
  }

  it("derives different default questions from each tenant's vocabulary", async () => {
    const chefQ = await defaultQuestionFor(tenants[0]!);
    const racerQ = await defaultQuestionFor(tenants[1]!);
    expect(chefQ).toBe("Which Chef will win?");
    expect(racerQ).toBe("Which Racer will win?");
    expect(chefQ).not.toBe(racerQ);
    // The old hard-coded literal never appears.
    expect(chefQ).not.toContain("competitor");
    expect(racerQ).not.toContain("competitor");
  });
});
