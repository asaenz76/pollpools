import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/ops/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { monitorWithLease } from "@/lib/ops/scheduled";

export const dynamic = "force-dynamic";

/**
 * Internal scheduled projection monitor. Checks projection health per tenant and
 * requeues actionable (stuck / current dead-letter / retrying) jobs; it never runs
 * a full tenant rebuild — that stays a manual, explicitly-triggered operation.
 * Same CRON_SECRET auth and lease/structured-result posture as the drain route.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  let tenantId: string | null = null;
  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { tenantId?: unknown };
    if (typeof body.tenantId === "string") tenantId = body.tenantId;
  }

  const admin = createAdminSupabase();
  const run = await monitorWithLease(admin, { tenantId, holder: crypto.randomUUID() });
  return NextResponse.json(run, { status: run.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
