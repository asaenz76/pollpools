import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/ops/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Internal scheduled Community Health snapshot (Phase 8-B.5). Authenticated by
 * CRON_SECRET. Persists one immutable daily snapshot per active tenant (idempotent
 * per day) so the dashboard reads persisted history rather than recomputing.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("snapshot_all_community_health" as never);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, snapshotted: data as number });
}

export const GET = handle;
export const POST = handle;
