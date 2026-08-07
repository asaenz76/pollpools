import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

function generateHandle(email: string | null, userId: string): string {
  const base = (email?.split("@")[0] ?? "member")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  const seed = userId.replace(/-/g, "").slice(0, 6);
  const candidate = `${base || "member"}_${seed}`;
  return candidate.slice(0, 30).padEnd(3, "0");
}

/**
 * Idempotently ensure the current user is a member of the tenant with a profile.
 * Uses the user's own session (RLS) so the self-join and own-profile insert
 * policies are exercised. Safe to call on every authed tenant page load.
 */
export async function ensureMembership(input: {
  tenantId: string;
  userId: string;
  email: string | null;
}): Promise<void> {
  const supabase = await createServerSupabase();

  await supabase
    .from("tenant_memberships")
    .upsert(
      { tenant_id: input.tenantId, user_id: input.userId, role: "member", status: "active" },
      { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
    );

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!existingProfile) {
    await supabase.from("profiles").insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      handle: generateHandle(input.email, input.userId),
      display_name: input.email?.split("@")[0] ?? "Member",
    });
  }

  // Stamp a daily login activity so "logged in" is a real, configurable WAU
  // signal (idempotent per day; best-effort — never blocks the page).
  await supabase.rpc("record_tenant_activity", { p_tenant: input.tenantId } as never);
}
