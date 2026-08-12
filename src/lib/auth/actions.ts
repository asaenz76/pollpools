"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { isValidTenantSlug } from "@/lib/tenant/resolver";
import { resolveTenantHomeUrl } from "@/lib/tenant/urls";
import { safeReturnPath } from "@/lib/domain/domains";
import { resolveDefaultDestination, resolvePlatformDestination } from "@/lib/auth/roles";

export type AuthFormState = { error: string | null };

const platformCredentialsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  slug: z.string().refine(isValidTenantSlug, "Invalid community"),
});

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  slug: z.string().refine(isValidTenantSlug, "Invalid community"),
});

function tenantHome(slug: string) {
  return `/t/${slug}`;
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "Incorrect email or password" };

  // A legitimate return target (the page the user was trying to reach before being
  // sent to sign in) wins — sanitized to a same-origin path, never trusted raw.
  // Otherwise land the user in their ROLE's default experience (RX.2).
  const requested = safeReturnPath(String(formData.get("next") ?? ""));
  const dest = requested !== "/" ? requested : await resolveDefaultDestination(supabase, data.user.id, parsed.data.slug);
  redirect(dest);
}

/**
 * Platform-level sign-in (`/sign-in`), independent of any tenant. Authentication is
 * global (Supabase), so no tenant slug is required — this is the entry point for
 * platform admins (and anyone) to reach their role's home. A super admin lands in
 * `/admin`; everyone else lands on the platform directory. A sanitized `next` return
 * target still wins when present (same open-redirect protection as the tenant flow).
 */
export async function platformSignInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = platformCredentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) return { error: "Incorrect email or password" };

  const requested = safeReturnPath(String(formData.get("next") ?? ""));
  const dest = requested !== "/" ? requested : await resolvePlatformDestination(supabase, data.user.id);
  redirect(dest);
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createServerSupabase();
  // Auth emails return to the tenant's PRIMARY domain (white label), not a shared
  // platform URL. Built server-side from the slug — never a client return URL.
  const returnUrl = await resolveTenantHomeUrl(supabase, parsed.data.slug);
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: returnUrl },
  });
  if (error) return { error: error.message };
  redirect(tenantHome(parsed.data.slug));
}

export async function requestResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const supabase = await createServerSupabase();
  const returnUrl = await resolveTenantHomeUrl(supabase, parsed.data.slug);
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: returnUrl,
  });
  // Always report success to avoid leaking which emails are registered.
  return { error: null };
}

export async function signOutAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect(isValidTenantSlug(slug) ? tenantHome(slug) : "/");
}
