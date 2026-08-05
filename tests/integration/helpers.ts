import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** True when a local Supabase is configured; integration tests skip otherwise. */
export const integrationEnvReady = Boolean(url && anonKey && serviceKey);

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, serviceKey!, noPersist);
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(url!, anonKey!, noPersist);
}

/** Create a confirmed auth user and return its id. */
export async function createUser(email: string, password: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

/** Sign in and return a client bound to that user's session (RLS applies). */
export async function signInAs(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

export async function deleteUser(id: string): Promise<void> {
  await adminClient().auth.admin.deleteUser(id);
}

/** Unique suffix per test run so reruns don't collide on unique constraints. */
export function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}
