import "server-only";

import { createHash } from "node:crypto";
import { getBillingProvider, billingWebhookSecret } from "@/lib/billing/index";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/types/rpc";

export type WebhookResult = { status: number; body: { ok: boolean; reason?: string } };

/**
 * Process an inbound billing webhook (spec §5, §14). Verifies the signature on
 * the RAW body first, stores the event idempotently, applies it via
 * `apply_billing_event`, and returns success for already-processed duplicates.
 * Safe to retry; never trusts redirects.
 */
export async function processBillingWebhook(rawBody: string, signature: string): Promise<WebhookResult> {
  const provider = getBillingProvider();
  const secret = billingWebhookSecret();

  if (!signature || !provider.verifyWebhookSignature(rawBody, signature, secret)) {
    return { status: 401, body: { ok: false, reason: "invalid_signature" } };
  }

  let event;
  try {
    event = provider.parseWebhookEvent(rawBody);
  } catch {
    return { status: 400, body: { ok: false, reason: "unparseable" } };
  }

  const admin = createAdminSupabase();
  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");

  // Store idempotently. Existing + processed → success (harmless duplicate).
  const insert = await admin
    .from("billing_webhook_events")
    .insert({
      provider: provider.id,
      provider_event_id: event.providerEventId,
      event_type: event.providerEventName,
      signature_verified: true,
      payload_hash: payloadHash,
      raw_payload: JSON.parse(rawBody),
      processing_status: "received",
    })
    .select("id")
    .maybeSingle();

  let webhookId = insert.data?.id;
  if (!webhookId) {
    const { data: existing } = await admin
      .from("billing_webhook_events")
      .select("id, processing_status")
      .eq("provider", provider.id)
      .eq("provider_event_id", event.providerEventId)
      .maybeSingle();
    if (!existing) return { status: 500, body: { ok: false, reason: "store_failed" } };
    if (existing.processing_status === "processed") return { status: 200, body: { ok: true, reason: "duplicate" } };
    webhookId = existing.id;
  }

  // Apply the normalized event (idempotent inside the DB function). The event is
  // a JSON-serializable domain object; cast to the generated Json arg type.
  const { error } = await admin.rpc("apply_billing_event", {
    p_webhook_id: webhookId,
    p_event: event as unknown as Json,
  });

  if (error) {
    await admin
      .from("billing_webhook_events")
      .update({ processing_status: "failed", failure_reason: error.message.slice(0, 500), attempts: 1 })
      .eq("id", webhookId);
    return { status: 500, body: { ok: false, reason: "processing_failed" } };
  }

  await admin
    .from("billing_webhook_events")
    .update({ processing_status: "processed", processed_at: new Date().toISOString() })
    .eq("id", webhookId);

  return { status: 200, body: { ok: true } };
}
