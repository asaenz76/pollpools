// Idempotent demo seed for the reference tenant (Marble Grand Prix).
// Creates a verified creator, marble competitors, a standalone race with a
// market, a Season grouping it, and a single-elimination Bracket (via the
// authorized create_bracket RPC signed in as the creator owner).
//
// Usage: npm run db:seed:demo   (requires local Supabase running + .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const OWNER_EMAIL = "creator@marblegp.test";
const OWNER_PW = "Password123!";

const MARBLES = [
  { name: "Red Rocket", slug: "red-rocket", color: "#ef4444" },
  { name: "Blue Bolt", slug: "blue-bolt", color: "#3b82f6" },
  { name: "Green Flash", slug: "green-flash", color: "#22c55e" },
  { name: "Sunny Yellow", slug: "sunny-yellow", color: "#eab308" },
  { name: "Purple Comet", slug: "purple-comet", color: "#a855f7" },
  { name: "Orange Crush", slug: "orange-crush", color: "#fb923c" },
  { name: "Pink Panther", slug: "pink-panther", color: "#ec4899" },
  { name: "Teal Titan", slug: "teal-titan", color: "#14b8a6" },
];

// --- compact bracket generator (mirrors src/lib/domain/bracket.ts; demo only) --
function nextPow2(n) { let p = 2; while (p < n) p *= 2; return p; }
function seedOrder(size) {
  const rounds = Math.log2(size);
  let order = [1, 2];
  for (let r = 1; r < rounds; r++) {
    const sum = 2 ** (r + 1) + 1; const next = [];
    for (const x of order) next.push(x, sum - x);
    order = next;
  }
  return order;
}
function roundName(e) { return e === 2 ? "Final" : e === 4 ? "Semifinals" : e === 8 ? "Quarterfinals" : `Round of ${e}`; }
function generateStructure(competitors) {
  const count = competitors.length, size = nextPow2(count), totalRounds = Math.log2(size), order = seedOrder(size);
  const seedTo = (s) => (s <= count ? competitors[s - 1] : null);
  const matches = []; let gi = 0; let prev = [];
  for (let m = 0; m < size / 2; m++) {
    const a = seedTo(order[2 * m]), b = seedTo(order[2 * m + 1]);
    const isBye = (a === null) !== (b === null);
    const mm = { index: gi++, round: 1, position: m, a, b, srcA: null, srcB: null, isBye, bye: isBye ? (a ?? b) : null };
    matches.push(mm); prev.push(mm);
  }
  for (let round = 2; round <= totalRounds; round++) {
    const cur = [];
    for (let m = 0; m < prev.length / 2; m++) {
      const mm = { index: gi++, round, position: m, a: null, b: null, srcA: prev[2 * m].index, srcB: prev[2 * m + 1].index, isBye: false, bye: null };
      matches.push(mm); cur.push(mm);
    }
    prev = cur;
  }
  const rounds = [];
  for (let r = 1; r <= totalRounds; r++) rounds.push({ round_number: r, name: roundName(size / 2 ** (r - 1)), size: size / 2 ** (r - 1) });
  return {
    rounds,
    matches: matches.map((m) => ({
      match_index: m.index, round_number: m.round, position: m.position,
      competitor_a_id: m.a, competitor_b_id: m.b, source_a_index: m.srcA, source_b_index: m.srcB,
      is_bye: m.isBye, bye_competitor_id: m.bye,
    })),
  };
}

async function upsertCompetition(row) {
  const { data, error } = await db.from("competitions").upsert(row, { onConflict: "tenant_id,slug" }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function main() {
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", "marbles").maybeSingle();
  if (!tenant) throw new Error("Tenant 'marbles' not found — run `npm run db:reset` first.");
  const tenantId = tenant.id;

  // Creator owner (idempotent).
  let ownerId;
  const created = await db.auth.admin.createUser({ email: OWNER_EMAIL, password: OWNER_PW, email_confirm: true });
  if (created.error) {
    const { data: u } = await db.from("users").select("id").eq("email", OWNER_EMAIL).maybeSingle();
    if (!u) throw created.error;
    ownerId = u.id;
  } else ownerId = created.data.user.id;

  await db.from("tenant_memberships").upsert(
    { tenant_id: tenantId, user_id: ownerId, role: "creator", status: "active" },
    { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
  );

  // Local dev convenience: grant the demo owner the platform super_admin role so
  // the /admin operations surface is reachable after seeding. Demo-only.
  const { data: existingSuper } = await db.from("user_roles").select("id").eq("user_id", ownerId).eq("role", "super_admin").is("tenant_id", null).maybeSingle();
  if (!existingSuper) await db.from("user_roles").insert({ user_id: ownerId, role: "super_admin", tenant_id: null });

  const { data: creator } = await db
    .from("creators")
    .upsert(
      { tenant_id: tenantId, owner_user_id: ownerId, display_name: "Marble League HQ", slug: "marble-league-hq", description: "Official marble racing on Marble Grand Prix.", verification_status: "verified", supporter_subscriptions_enabled: true, settlement_enabled: true },
      { onConflict: "tenant_id,slug" },
    )
    .select("id")
    .single();
  const creatorId = creator.id;

  // Billing products (mock provider): Platform Premium + Creator Support.
  const { count: premiumCount } = await db.from("billing_products").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("product_type", "platform_premium");
  if (!premiumCount) {
    await db.from("billing_products").insert({ tenant_id: tenantId, product_type: "platform_premium", name: "Marble Grand Prix Premium", description: "Advanced analytics, full history, premium profile.", provider: "mock", provider_variant_id: "mock_premium", status: "active", currency_code: "USD", price_minor_units: 499, billing_interval: "monthly" });
  }
  const { count: supportCount } = await db.from("billing_products").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("product_type", "creator_support").eq("creator_id", creatorId);
  if (!supportCount) {
    await db.from("billing_products").insert({ tenant_id: tenantId, product_type: "creator_support", name: "Support Marble League HQ", description: "Supporter badge + creator updates.", provider: "mock", provider_variant_id: "mock_support", status: "active", currency_code: "USD", price_minor_units: 300, billing_interval: "monthly", creator_id: creatorId });
  }
  const { count: ruleCount } = await db.from("creator_revenue_rules").select("*", { count: "exact", head: true }).eq("creator_id", creatorId).eq("product_type", "creator_support");
  if (!ruleCount) {
    await db.from("creator_revenue_rules").insert({ tenant_id: tenantId, creator_id: creatorId, product_type: "creator_support", creator_share_basis_points: 8000, platform_share_basis_points: 2000, effective_from: new Date().toISOString(), created_by: ownerId });
  }

  // Competitors.
  const competitorIds = {};
  for (const m of MARBLES) {
    const { data } = await db
      .from("competitors")
      .upsert({ tenant_id: tenantId, creator_id: creatorId, name: m.name, slug: m.slug, color: m.color }, { onConflict: "tenant_id,slug" })
      .select("id")
      .single();
    competitorIds[m.slug] = data.id;
  }

  // Season (groups the standalone race).
  const seasonId = await upsertCompetition({
    tenant_id: tenantId, creator_id: creatorId, type: "SEASON", title: "Season 1", slug: "season-1",
    description: "The inaugural Marble Grand Prix season.", status: "active",
  });

  // Standalone race (in the season) + market + options.
  const locksAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: event } = await db
    .from("events")
    .upsert(
      { tenant_id: tenantId, competition_id: seasonId, creator_id: creatorId, title: "Marble Grand Prix — Race 1", slug: "race-1", description: "The season opener. Eight marbles, one straight sprint to glory.", status: "open", starts_at: locksAt, locks_at: locksAt, result_source: "creator_manual" },
      { onConflict: "tenant_id,slug" },
    )
    .select("id")
    .single();
  const eventId = event.id;

  // Optional event media via the generic model (Phase 7.6) — not the legacy youtube_url column.
  const { data: existingMedia } = await db.from("event_media_links").select("id").eq("event_id", eventId).maybeSingle();
  if (!existingMedia) {
    await db.from("event_media_links").insert({ tenant_id: tenantId, event_id: eventId, provider: "youtube", media_type: "livestream", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", is_primary: true, label: "Watch the race live" });
  }

  for (const m of MARBLES) {
    await db.from("event_competitors").upsert({ tenant_id: tenantId, event_id: eventId, competitor_id: competitorIds[m.slug] }, { onConflict: "event_id,competitor_id", ignoreDuplicates: true });
  }

  const { data: existingMarket } = await db.from("markets").select("id").eq("event_id", eventId).maybeSingle();
  let marketId = existingMarket?.id;
  if (!marketId) {
    const { data: market } = await db
      .from("markets")
      .insert({ tenant_id: tenantId, event_id: eventId, question: "Which marble will win?", type: "SINGLE_CHOICE_WINNER", status: "open", locks_at: locksAt })
      .select("id")
      .single();
    marketId = market.id;
    await db.from("market_options").insert(
      MARBLES.map((m, i) => ({ tenant_id: tenantId, market_id: marketId, competitor_id: competitorIds[m.slug], label: m.name, color: m.color, display_order: i, status: "active" })),
    );
  }

  // Bracket (Knockout Cup) via the authorized RPC, signed in as the owner.
  const bracketId = await upsertCompetition({
    tenant_id: tenantId, creator_id: creatorId, type: "BRACKET", title: "Knockout Cup", slug: "knockout-cup",
    description: "Single-elimination. Eight marbles enter, one is crowned.", status: "active",
  });
  const { count: existingRounds } = await db.from("bracket_rounds").select("*", { count: "exact", head: true }).eq("competition_id", bracketId);
  if (!existingRounds) {
    const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await ownerClient.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PW });
    if (signInErr) throw signInErr;
    const orderedIds = MARBLES.map((m) => competitorIds[m.slug]);
    const structure = generateStructure(orderedIds);
    const { error } = await ownerClient.rpc("create_bracket", { p_competition_id: bracketId, p_structure: structure });
    if (error) throw error;
  }

  console.log("✅ Demo seed complete:");
  console.log("   Standalone race: /t/marbles/e/race-1");
  console.log("   Season:          /t/marbles/c/season-1");
  console.log("   Bracket:         /t/marbles/c/knockout-cup");
}

main().catch((e) => {
  console.error("Seed failed:", e.message ?? e);
  process.exit(1);
});
