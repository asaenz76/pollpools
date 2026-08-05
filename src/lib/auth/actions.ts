"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { isValidTenantSlug } from "@/lib/tenant/resolver";

export type AuthFormState = { error: string | null };

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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { error: "Incorrect email or password" };
  redirect(tenantHome(parsed.data.slug));
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
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}${tenantHome(parsed.data.slug)}` },
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
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}${tenantHome(parsed.data.slug)}`,
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
