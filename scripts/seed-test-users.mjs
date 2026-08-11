// Idempotent test-user seed for local manual testing of every user type.
// Creates: a pure Super Admin, and a plain Member of the marbles tenant.
// (The existing creator@marblegp.test remains Super Admin + Creator/Owner.)
// Usage: node scripts/seed-test-users.mjs   (requires local Supabase + .env.local)
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function ensureUser(email, password) {
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error && created?.user?.id) return created.user.id;
  const { data: u } = await db.from("users").select("id").eq("email", email).maybeSingle();
  if (!u) throw new Error(`Could not create or find ${email}: ${error?.message}`);
  return u.id;
}

async function main() {
  const { data: tenant } = await db.from("tenants").select("id").eq("slug", "marbles").maybeSingle();
  if (!tenant) throw new Error("Tenant 'marbles' not found — run `npm run db:reset && npm run db:seed:demo` first.");
  const tenantId = tenant.id;

  // ── Pure Super Admin ────────────────────────────────────────────────────────
  const adminId = await ensureUser("admin@pollpools.test", "Password123!");
  const { data: existingSuper } = await db.from("user_roles").select("id").eq("user_id", adminId).eq("role", "super_admin").is("tenant_id", null).maybeSingle();
  if (!existingSuper) await db.from("user_roles").insert({ user_id: adminId, role: "super_admin", tenant_id: null });
  await db.from("tenant_memberships").upsert({ tenant_id: tenantId, user_id: adminId, role: "member", status: "active" }, { onConflict: "tenant_id,user_id", ignoreDuplicates: true });

  // ── Plain Member / Predictor ────────────────────────────────────────────────
  const memberId = await ensureUser("member@marblegp.test", "Password123!");
  await db.from("tenant_memberships").upsert({ tenant_id: tenantId, user_id: memberId, role: "member", status: "active" }, { onConflict: "tenant_id,user_id", ignoreDuplicates: true });

  console.log("✅ Test users ready:");
  console.log("   Super Admin : admin@pollpools.test / Password123!");
  console.log("   Member      : member@marblegp.test / Password123!");
  console.log("   (Creator/Owner + Admin already: creator@marblegp.test / Password123!)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
