// Adds sample predictions to the demo race so community sentiment is visible.
// Demo-only: inserts directly via the service role. Real predictions always go
// through submit_prediction. Usage: node scripts/seed-predictions.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", "marbles").single();
  const { data: event } = await db
    .from("events")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("slug", "race-1")
    .single();
  const { data: market } = await db.from("markets").select("id").eq("event_id", event.id).single();
  const { data: options } = await db
    .from("market_options")
    .select("id, label, display_order")
    .eq("market_id", market.id)
    .order("display_order");

  // Distribution across options (by display order): 3,2,1,1,0.
  const weights = [3, 2, 1, 1, 0];
  let n = 0;
  for (let oi = 0; oi < options.length; oi++) {
    for (let k = 0; k < (weights[oi] ?? 0); k++) {
      const email = `demo-fan-${oi}-${k}@marblegp.test`;
      let userId;
      const created = await db.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
      if (created.error) {
        const { data: u } = await db.from("users").select("id").eq("email", email).maybeSingle();
        if (!u) throw created.error;
        userId = u.id;
      } else {
        userId = created.data.user.id;
      }
      await db
        .from("tenant_memberships")
        .upsert({ tenant_id: tenant.id, user_id: userId, role: "member" }, { onConflict: "tenant_id,user_id", ignoreDuplicates: true });
      await db
        .from("predictions")
        .upsert(
          {
            tenant_id: tenant.id,
            market_id: market.id,
            user_id: userId,
            option_id: options[oi].id,
            original_option_id: options[oi].id,
            idempotency_key: `seed-${market.id}-${userId}`,
            status: "active",
          },
          { onConflict: "market_id,user_id", ignoreDuplicates: true },
        );
      n++;
    }
  }
  console.log(`✅ Seeded ${n} sample predictions on /t/marbles/e/race-1`);
}

main().catch((e) => {
  console.error("Failed:", e.message ?? e);
  process.exit(1);
});
