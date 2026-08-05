import { NextResponse, type NextRequest } from "next/server";
import { processBillingWebhook } from "@/lib/billing/webhook";

// Lemon Squeezy signs the raw body with HMAC-SHA256 in the `X-Signature` header.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  const result = await processBillingWebhook(rawBody, signature);
  return NextResponse.json(result.body, { status: result.status });
}
