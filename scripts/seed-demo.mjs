// Idempotent demo seed for the reference tenant (Marble Grand Prix).
// Creates a verified creator, marble competitors, an open standalone race, and
// a "Which marble will win?" market with options mapped to competitors.
//
// Usage: npm run db:seed:demo   (requires local Supabase running + .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const MARBLES = [
  { name: "Red Rocket", slug: "red-rocket", color: "#ef4444" },
  { name: "Blue Bolt", slug: "blue-bolt", color: "#3b82f6" },
  { name: "Green Flash", slug: "green-flash", color: "#22c55e" },
  { name: "Sunny Yellow", slug: "sunny-yellow", color: "#eab308" },
  { name: "Purple Comet", slug: "purple-comet", color: "#a855f7" },
];

async function main() {
  // Tenant
  const { data: tenant, error: tErr } = await db
    .from("tenants")
    .select("id")
    .eq("slug", "marbles")
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tenant) throw new Error("Tenant 'marbles' not found — run `npm run db:reset` first.");
  const tenantId = tenant.id;

  // Creator owner auth user (idempotent)
  const email = "creator@marblegp.test";
  let ownerId;
  const created = await db.auth.admin.createUser({
    email,
    password: "Password123!",
    email_confirm: true,
  });
  if (created.error) {
    const { data: existing } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!existing) throw created.error;
    ownerId = existing.id;
  } else {
    ownerId = created.data.user.id;
  }

  // Membership (creator role) for the owner
  await db
    .from("tenant_memberships")
    .upsert(
      { tenant_id: tenantId, user_id: ownerId, role: "creator", status: "active" },
      { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
    );

  // Creator (verified)
  const { data: creator, error: cErr } = await db
    .from("creators")
    .upsert(
      {
        tenant_id: tenantId,
        owner_user_id: ownerId,
        display_name: "Marble League HQ",
        slug: "marble-league-hq",
        description: "Official marble racing on Marble Grand Prix.",
        verification_status: "verified",
        supporter_subscriptions_enabled: true,
      },
      { onConflict: "tenant_id,slug" },
    )
    .select("id")
    .single();
  if (cErr) throw cErr;
  const creatorId = creator.id;

  // Competitors
  const competitorIds = {};
  for (const m of MARBLES) {
    const { data, error } = await db
      .from("competitors")
      .upsert(
        { tenant_id: tenantId, creator_id: creatorId, name: m.name, slug: m.slug, color: m.color },
        { onConflict: "tenant_id,slug" },
      )
      .select("id")
      .single();
    if (error) throw error;
    competitorIds[m.slug] = data.id;
  }

  // Standalone event (open, locks in 7 days)
  const locksAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000 + 3600 * 1000).toISOString();
  const { data: event, error: eErr } = await db
    .from("events")
    .upsert(
      {
        tenant_id: tenantId,
        creator_id: creatorId,
        title: "Marble Grand Prix — Race 1",
        slug: "race-1",
        description: "The season opener. Five marbles, one straight sprint to glory.",
        status: "open",
        starts_at: startsAt,
        locks_at: locksAt,
        youtube_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        result_source: "creator_manual",
      },
      { onConflict: "tenant_id,slug" },
    )
    .select("id")
    .single();
  if (eErr) throw eErr;
  const eventId = event.id;

  // Event competitors
  for (const m of MARBLES) {
    await db
      .from("event_competitors")
      .upsert(
        { tenant_id: tenantId, event_id: eventId, competitor_id: competitorIds[m.slug] },
        { onConflict: "event_id,competitor_id", ignoreDuplicates: true },
      );
  }

  // Market + options (only if the event has no market yet)
  const { data: existingMarket } = await db
    .from("markets")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  let marketId = existingMarket?.id;
  if (!marketId) {
    const { data: market, error: mErr } = await db
      .from("markets")
      .insert({
        tenant_id: tenantId,
        event_id: eventId,
        question: "Which marble will win?",
        type: "SINGLE_CHOICE_WINNER",
        status: "open",
        locks_at: locksAt,
      })
      .select("id")
      .single();
    if (mErr) throw mErr;
    marketId = market.id;

    const options = MARBLES.map((m, i) => ({
      tenant_id: tenantId,
      market_id: marketId,
      competitor_id: competitorIds[m.slug],
      label: m.name,
      color: m.color,
      display_order: i,
      status: "active",
    }));
    const { error: oErr } = await db.from("market_options").insert(options);
    if (oErr) throw oErr;
  }

  console.log("✅ Demo seed complete:");
  console.log(`   Tenant:    marbles (${tenantId})`);
  console.log(`   Creator:   marble-league-hq (${creatorId})`);
  console.log(`   Event:     /t/marbles/e/race-1`);
  console.log(`   Market:    ${marketId} with ${MARBLES.length} options`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
