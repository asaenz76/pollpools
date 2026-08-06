import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/ops/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { drainWithLease } from "@/lib/ops/scheduled";

// Never statically evaluated / cached — this must run on every invocation.
export const dynamic = "force-dynamic";

/**
 * Internal scheduled job-drain. Authenticated by CRON_SECRET (Vercel Cron sends
 * `Authorization: Bearer <CRON_SECRET>`). GET and POST behave identically so it
 * works with schedulers that issue either. A crashed/overlapping run is prevented
 * by the durable worker lease. The response is structured; failures are surfaced,
 * never swallowed; no secret is ever included in the body.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });

  let tenantId: string | null = null;
  let maxBatches: number | undefined;
  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { tenantId?: unknown; maxBatches?: unknown };
    if (typeof body.tenantId === "string") tenantId = body.tenantId;
    if (typeof body.maxBatches === "number") maxBatches = Math.min(Math.max(1, Math.floor(body.maxBatches)), 200);
  }

  const admin = createAdminSupabase();
  const run = await drainWithLease(admin, { tenantId, holder: crypto.randomUUID(), maxBatches });
  return NextResponse.json(run, { status: run.ok ? 200 : 500 });
}

export const GET = handle;
export const POST = handle;
