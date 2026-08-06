import { NextResponse, type NextRequest } from "next/server";
import { processBillingWebhook } from "@/lib/billing/webhook";
import { mockBillingUnavailable } from "@/lib/billing/mock-guard";

// Mock provider webhook (local/test). Same verify → record → apply pipeline.
export async function POST(request: NextRequest) {
  // Never reachable in production — mock webhooks are self-signable.
  if (mockBillingUnavailable()) return new NextResponse("Not found", { status: 404 });
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  const result = await processBillingWebhook(rawBody, signature);
  return NextResponse.json(result.body, { status: result.status });
}
