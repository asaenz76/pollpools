// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { generateBracket, bracketToStructure } from "@/lib/domain/bracket";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const d = integrationEnvReady ? describe : describe.skip;

d("bracket creation & advancement", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  let owner: SupabaseClient<Database>;
  let competitionId: string;
  let competitorIds: string[] = [];

  const slot = async (matchIndex: number) => {
    const { data } = await admin
      .from("bracket_slots")
      .select("id, event_id, competitor_a_id, competitor_b_id, winner_competitor_id, is_bye, status")
      .eq("competition_id", competitionId)
      .eq("match_index", matchIndex)
      .single();
    return data!;
  };

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `brk-${s}`, display_name: "Bracket Tenant" }).select("id").single();
    tenantId = t!.id;
    ownerId = await createUser(`owner-${s}@example.test`, pw);
    const { data: c } = await admin
      .from("creators")
      .insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "BC", slug: `bc-${s}`, verification_status: "verified" })
      .select("id")
      .single();
    creatorId = c!.id;

    // 5 competitors → bracket size 8 with 3 byes.
    const { data: comps } = await admin
      .from("competitors")
      .insert(
        Array.from({ length: 5 }, (_, i) => ({
          tenant_id: tenantId,
          creator_id: creatorId,
          name: `Marble ${i + 1}`,
          slug: `m-${s}-${i + 1}`,
        })),
      )
      .select("id");
    competitorIds = comps!.map((c) => c.id);

    const { data: comp } = await admin
      .from("competitions")
      .insert({ tenant_id: tenantId, creator_id: creatorId, type: "BRACKET", title: "Cup", slug: `cup-${s}`, status: "active" })
      .select("id")
      .single();
    competitionId = comp!.id;

    owner = await signInAs(`owner-${s}@example.test`, pw);
  }, 30_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    if (ownerId) await deleteUser(ownerId);
  });

  it("creates the bracket, resolves byes, and opens the first playable matchups", async () => {
    const structure = bracketToStructure(generateBracket(competitorIds));
    const { error } = await owner.rpc("create_bracket", { p_competition_id: competitionId, p_structure: structure });
    expect(error).toBeNull();

    // 8-size bracket: 3 rounds, 7 matchups (4 + 2 + 1).
    const { count: rounds } = await admin.from("bracket_rounds").select("*", { count: "exact", head: true }).eq("competition_id", competitionId);
    expect(rounds).toBe(3);
    const { count: slots } = await admin.from("bracket_slots").select("*", { count: "exact", head: true }).eq("competition_id", competitionId);
    expect(slots).toBe(7);

    // 3 byes (5 competitors in size 8), all resolved to a winner.
    const { data: byes } = await admin.from("bracket_slots").select("winner_competitor_id, is_bye").eq("competition_id", competitionId).eq("is_bye", true);
    expect(byes).toHaveLength(3);
    expect(byes!.every((b) => b.winner_competitor_id)).toBe(true);

    // Round-1 real match (m1) has an event; the all-bye-fed semi (m5) is also open.
    expect((await slot(1)).event_id).not.toBeNull();
    const m5 = await slot(5);
    expect(m5.competitor_a_id).not.toBeNull();
    expect(m5.competitor_b_id).not.toBeNull();
    expect(m5.event_id).not.toBeNull();
    // The other semi (m4) waits on the round-1 winner.
    expect((await slot(4)).event_id).toBeNull();
  });

  it("advances winners through to a champion via advance_bracket", async () => {
    // Settle the one round-1 match: competitor A wins.
    const m1 = await slot(1);
    await admin.rpc("advance_bracket", { p_event_id: m1.event_id!, p_winner_competitor_id: m1.competitor_a_id! });

    // Now the waiting semi (m4) should be opened with the round-1 winner in it.
    const m4 = await slot(4);
    expect(m4.event_id).not.toBeNull();
    expect([m4.competitor_a_id, m4.competitor_b_id]).toContain(m1.competitor_a_id);

    // Settle both semis.
    const m5 = await slot(5);
    await admin.rpc("advance_bracket", { p_event_id: m4.event_id!, p_winner_competitor_id: m4.competitor_a_id! });
    await admin.rpc("advance_bracket", { p_event_id: m5.event_id!, p_winner_competitor_id: m5.competitor_a_id! });

    // The final (m6) should now be open with the two semi winners.
    const final = await slot(6);
    expect(final.event_id).not.toBeNull();
    expect(final.competitor_a_id).toBe(m4.competitor_a_id);
    expect(final.competitor_b_id).toBe(m5.competitor_a_id);

    // Settle the final.
    await admin.rpc("advance_bracket", { p_event_id: final.event_id!, p_winner_competitor_id: final.competitor_a_id! });
    const champ = await slot(6);
    expect(champ.winner_competitor_id).toBe(final.competitor_a_id);
    expect(champ.status).toBe("decided");
  });

  it("rejects a winner that is not in the matchup", async () => {
    const m5 = await slot(5);
    const outsider = competitorIds.find((id) => id !== m5.competitor_a_id && id !== m5.competitor_b_id)!;
    const { error } = await admin.rpc("advance_bracket", { p_event_id: m5.event_id!, p_winner_competitor_id: outsider });
    // m5 already decided, but the winner-validation still rejects an outsider.
    expect(error?.message).toContain("WINNER_NOT_IN_MATCH");
  });

  it("prevents a non-owner from creating a bracket", async () => {
    const otherEmail = `other-${s}@example.test`;
    const otherId = await createUser(otherEmail, pw);
    const other = await signInAs(otherEmail, pw);
    const { data: comp2 } = await admin
      .from("competitions")
      .insert({ tenant_id: tenantId, creator_id: creatorId, type: "BRACKET", title: "Cup2", slug: `cup2-${s}`, status: "active" })
      .select("id")
      .single();
    const structure = bracketToStructure(generateBracket(competitorIds));
    const { error } = await other.rpc("create_bracket", { p_competition_id: comp2!.id, p_structure: structure });
    expect(error?.message).toContain("NOT_AUTHORIZED");
    await deleteUser(otherId);
  });
});
