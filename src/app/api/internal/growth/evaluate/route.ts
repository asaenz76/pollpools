import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/ops/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Internal scheduled Revenue Plan evaluation (Phase 8-B.5). Authenticated by
 * CRON_SECRET. Evaluates every active tenant: automatic upgrades apply
 * immediately; downgrades move through the grace period and only occur when it
 * expires. Deterministic and idempotent — safe to run on any cadence.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("evaluate_all_tenant_plans" as never);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, evaluated: data as number });
}

export const GET = handle;
export const POST = handle;
