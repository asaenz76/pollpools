import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";

/**
 * Service-role Supabase client. BYPASSES RLS — use ONLY in trusted server code
 * (settlement engine, webhook handlers, admin jobs) behind explicit
 * authorization checks. Never import this from a Client Component or expose the
 * key to the browser. The `server-only` import above makes a client bundle that
 * references this file fail to build.
 */
export function createAdminSupabase() {
  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
