import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Redirects to the signed-in user's own profile within this tenant. */
export default async function MePage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);

  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from("profiles")
    .select("handle")
    .eq("tenant_id", ctx.tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) redirect(`/t/${ctx.tenant.slug}`);
  redirect(`/t/${ctx.tenant.slug}/u/${profile.handle}`);
}
