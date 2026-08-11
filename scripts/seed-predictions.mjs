// Adds sample predictions + one fully-settled past race so community sentiment,
// settled-result UI, statistics, achievements, and the leaderboard are all
// populated. Demo-only. Usage: node scripts/seed-predictions.mjs
import { loadLocalEnv, assertLocalDb } from "./local-env.mjs";
loadLocalEnv();
assertLocalDb();
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function ensureUser(email) {
  const created = await db.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
  if (!created.error) return created.data.user.id;
  const { data } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (!data) throw created.error;
  return data.id;
}

async function main() {
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", "marbles").single();
  const tenantId = tenant.id;
  const { data: creator } = await db.from("creators").select("id").eq("tenant_id", tenantId).eq("slug", "marble-league-hq").single();
  const creatorId = creator.id;

  // ── Sample predictions on the open race-1 (community sentiment) ────────────
  const { data: event } = await db.from("events").select("id").eq("tenant_id", tenantId).eq("slug", "race-1").single();
  const { data: market } = await db.from("markets").select("id").eq("event_id", event.id).single();
  const { data: options } = await db.from("market_options").select("id, display_order").eq("market_id", market.id).order("display_order");

  const weights = [3, 2, 1, 1, 0];
  const fans = [];
  const FAN_NAMES = ["Ava", "Ben", "Cleo", "Dax", "Esme", "Finn", "Gwen"];
  for (let oi = 0; oi < options.length; oi++) {
    for (let k = 0; k < (weights[oi] ?? 0); k++) {
      const email = `demo-fan-${oi}-${k}@marblegp.test`;
      const uid = await ensureUser(email);
      const n = fans.length;
      fans.push(uid);
      await db.from("tenant_memberships").upsert({ tenant_id: tenantId, user_id: uid, role: "member" }, { onConflict: "tenant_id,user_id", ignoreDuplicates: true });
      await db.from("profiles").upsert(
        { tenant_id: tenantId, user_id: uid, handle: `fan_${n}`, display_name: FAN_NAMES[n] ?? `Fan ${n}` },
        { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
      );
      await db.from("predictions").upsert(
        { tenant_id: tenantId, market_id: market.id, user_id: uid, option_id: options[oi].id, original_option_id: options[oi].id, idempotency_key: `seed-${market.id}-${uid}`, status: "active" },
        { onConflict: "market_id,user_id", ignoreDuplicates: true },
      );
    }
  }

  // ── A fully-settled past race (race-0) → stats + leaderboard + achievements ─
  const { data: comps } = await db.from("competitors").select("id, slug, name").eq("tenant_id", tenantId);
  const compBySlug = Object.fromEntries(comps.map((c) => [c.slug, c.id]));
  const nameBySlug = Object.fromEntries(comps.map((c) => [c.slug, c.name]));
  const { data: season } = await db.from("competitions").select("id").eq("tenant_id", tenantId).eq("slug", "season-1").maybeSingle();

  const { data: pastEvent } = await db
    .from("events")
    .upsert(
      { tenant_id: tenantId, competition_id: season?.id ?? null, creator_id: creatorId, title: "Marble Grand Prix — Race 0 (Preseason)", slug: "race-0", description: "The preseason exhibition — already run and settled.", status: "open", starts_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), locks_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(), youtube_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", result_source: "creator_manual" },
      { onConflict: "tenant_id,slug" },
    )
    .select("id, status")
    .single();

  let pastMarketId = (await db.from("markets").select("id").eq("event_id", pastEvent.id).maybeSingle()).data?.id;
  if (!pastMarketId) {
    const marbleSlugs = ["red-rocket", "blue-bolt", "green-flash", "sunny-yellow", "purple-comet"];
    const { data: pm } = await db.from("markets").insert({ tenant_id: tenantId, event_id: pastEvent.id, question: "Which marble won?", status: "open" }).select("id").single();
    pastMarketId = pm.id;
    await db.from("market_options").insert(
      marbleSlugs.map((slug, i) => ({ tenant_id: tenantId, market_id: pastMarketId, competitor_id: compBySlug[slug], label: nameBySlug[slug], color: null, display_order: i, status: "active" })),
    );
  }

  // Everyone predicts on race-0 (spread across options), then settle it.
  const { data: pastOptions } = await db.from("market_options").select("id, competitor_id, display_order").eq("market_id", pastMarketId).order("display_order");
  const distribution = [3, 2, 1, 1, 0];
  let fi = 0;
  for (let oi = 0; oi < pastOptions.length; oi++) {
    for (let k = 0; k < (distribution[oi] ?? 0); k++) {
      const uid = fans[fi % fans.length];
      fi++;
      await db.from("predictions").upsert(
        { tenant_id: tenantId, market_id: pastMarketId, user_id: uid, option_id: pastOptions[oi].id, original_option_id: pastOptions[oi].id, idempotency_key: `seed0-${pastMarketId}-${uid}`, status: "active" },
        { onConflict: "market_id,user_id", ignoreDuplicates: true },
      );
    }
  }

  // ── Enable Competitor Draft on Season 1 (free, exclusive) ──────────────────
  const { data: creatorRow } = await db.from("creators").select("owner_user_id").eq("id", creatorId).single();
  const ownerId = creatorRow.owner_user_id;
  if (season?.id) {
    await db.from("competition_draft_settings").upsert(
      { tenant_id: tenantId, competition_id: season.id, is_enabled: true, mode: "exclusive", access_type: "free", status: "open", closes_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), created_by: ownerId },
      { onConflict: "competition_id", ignoreDuplicates: true },
    );
    await db.from("draft_scoring_rules").upsert(
      { tenant_id: tenantId, competition_id: season.id, scoring_type: "competition_points", config: { position_points: { 1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 } } },
      { onConflict: "competition_id", ignoreDuplicates: true },
    );
    // Three non-monetary prizes.
    const { count: prizeCount } = await db.from("competition_prizes").select("*", { count: "exact", head: true }).eq("competition_id", season.id);
    if (!prizeCount) {
      await db.from("competition_prizes").insert([
        { tenant_id: tenantId, competition_id: season.id, title: "Season Champion", description: "Hall of Fame + champion badge", category: "recognition", placement_from: 1, placement_to: 1, fulfillment_owner_type: "platform" },
        { tenant_id: tenantId, competition_id: season.id, title: "Trophy Cabinet Item", description: "Digital trophy for your profile", category: "digital", placement_from: 1, placement_to: 3, fulfillment_owner_type: "platform" },
        { tenant_id: tenantId, competition_id: season.id, title: "3D-Printed Trophy", description: "Physical trophy, shipped", category: "physical", placement_from: 1, placement_to: 1, fulfillment_owner_type: "creator", requires_shipping: true },
      ]);
    }
    // A few fans draft competitors (direct insert for seed; real drafts use draft_competitor).
    const draftPicks = [["red-rocket", 0], ["blue-bolt", 1], ["green-flash", 2]];
    for (const [slug, fanIdx] of draftPicks) {
      const uid = fans[fanIdx];
      if (!uid) continue;
      await db.from("competitor_draft_assignments").upsert(
        { tenant_id: tenantId, competition_id: season.id, competitor_id: compBySlug[slug], user_id: uid, status: "confirmed", assignment_source: "user_selected", payment_status: "not_required", exclusive_slot: true, reserved_at: new Date().toISOString(), confirmed_at: new Date().toISOString(), idempotency_key: `seed-draft-${season.id}-${uid}` },
        { onConflict: "idempotency_key", ignoreDuplicates: true },
      );
    }
  }

  // Settle race-0 with Red Rocket as the winner (service role is authorized).
  if (pastEvent.status !== "settled") {
    const winner = compBySlug["red-rocket"];
    const { error } = await db.rpc("settle_event", {
      p_event_id: pastEvent.id,
      p_resolution: "settled",
      p_winning_competitor_id: winner,
      p_notes: "Red Rocket takes the preseason exhibition.",
      p_result_url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      p_idempotency_key: `seed-settle-${pastEvent.id}`,
    });
    if (error) throw error;
  }

  console.log(`✅ Seeded sample predictions + settled race-0 (leaderboard populated).`);
  console.log(`   Settled event: /t/marbles/e/race-0`);
  console.log(`   Leaderboard:   /t/marbles/leaderboard`);
}

main().catch((e) => {
  console.error("Failed:", e.message ?? e);
  process.exit(1);
});
