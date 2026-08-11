import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createEmailNotificationProvider, type EmailTransport } from "@/lib/providers/email";
import { deliverNotification, toDeliverable } from "@/lib/providers/notification";

export type EmailDeliveryOutcome = "sent" | "skipped" | "failed";

/**
 * Deliver ONE notification over email, durably and idempotently (PL.3). Called by
 * the `notification.email` job handler with the env transport, and by tests with a
 * memory transport. Records per-channel delivery state in `notification_deliveries`:
 *
 *  - already `sent`  → returns "sent" without re-sending (idempotent on retry).
 *  - transport null / no address → marks `skipped` (safe non-delivery, never faked).
 *  - transport error → marks `failed`, bumps attempts, and THROWS so the durable job
 *    queue retries and eventually dead-letters (visible in `system_jobs`).
 *
 * Runs entirely outside settlement — a failure here cannot affect grading/projections.
 */
export async function deliverEmailNotification(
  admin: SupabaseClient<Database>,
  notificationId: string,
  transport: EmailTransport | null,
): Promise<EmailDeliveryOutcome> {
  const { data: n } = await admin
    .from("notifications")
    .select("id, tenant_id, user_id, type, title, body, metadata")
    .eq("id", notificationId)
    .maybeSingle();
  if (!n) return "skipped"; // notification gone (deleted) → nothing to deliver

  // Idempotency: claim/observe the delivery row for this (notification, channel).
  const existing = (await admin.from("notification_deliveries").select("status, attempts").eq("notification_id", notificationId).eq("channel", "email").maybeSingle()).data;
  if (existing?.status === "sent") return "sent";
  const attempts = (existing?.attempts ?? 0) + 1;
  await admin.from("notification_deliveries").upsert(
    { tenant_id: n.tenant_id, notification_id: notificationId, channel: "email", status: "pending", attempts, provider: transport?.id ?? null } as never,
    { onConflict: "notification_id,channel" },
  );

  const mark = (status: EmailDeliveryOutcome, error?: string) =>
    admin.from("notification_deliveries").update({ status, error: error ?? null, updated_at: new Date().toISOString() } as never).eq("notification_id", notificationId).eq("channel", "email");

  const provider = createEmailNotificationProvider({
    transport,
    resolveEmail: async (userId) => (await admin.from("users").select("email").eq("id", userId).maybeSingle()).data?.email ?? null,
  });

  const result = await deliverNotification(provider, toDeliverable(n));
  if (result.ok && result.skipped) { await mark("skipped"); return "skipped"; }
  if (result.ok) { await mark("sent"); return "sent"; }
  // Failed: record and throw so the durable queue owns the retry/dead-letter.
  await mark("failed", result.error);
  throw new Error(`email delivery failed for ${notificationId}: ${result.error}`);
}
