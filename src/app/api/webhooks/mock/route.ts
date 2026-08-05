import { NextResponse, type NextRequest } from "next/server";
import { processBillingWebhook } from "@/lib/billing/webhook";

// Mock provider webhook (local/test). Same verify → record → apply pipeline.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  const result = await processBillingWebhook(rawBody, signature);
  return NextResponse.json(result.body, { status: result.status });
}
