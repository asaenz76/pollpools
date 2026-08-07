/**
 * Notification providers (Phase 8B.5 / finding F-22).
 *
 * Notification PRODUCTION stays transport-independent: the engine writes an
 * in-app `notifications` row (and respects `user_notification_preferences`).
 * DELIVERY is generalized behind a NotificationProvider — one per channel — so
 * out-of-band transports (email/sms/push/discord/slack/webhook/whatsapp) can be
 * added later without changing a single producer.
 *
 * Only the interface and the existing `in_app` implementation are built here.
 * For in-app, the persisted row IS the delivery, so its provider is a success
 * no-op; every other channel is a recognized id that stays unconfigured until an
 * implementation is registered.
 */
import type { NotificationType } from "@/types/enums";

export type NotificationChannel =
  | "in_app"
  | "email"
  | "sms"
  | "push"
  | "discord"
  | "slack"
  | "webhook"
  | "whatsapp";

/** A channel-agnostic view of a notification, mapped from a `notifications` row. */
export type DeliverableNotification = {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
};

export type DeliveryResult =
  | { ok: true; channel: NotificationChannel; skipped?: boolean }
  | { ok: false; channel: NotificationChannel; error: string };

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly label: string;
  /** Whether this channel can currently deliver (config/credentials present). */
  isConfigured(): boolean;
  /** Deliver one notification over this channel. */
  deliver(n: DeliverableNotification): Promise<DeliveryResult>;
}

/** Map a `notifications` table row to the channel-agnostic deliverable shape. */
export function toDeliverable(row: {
  id: string;
  tenant_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata?: unknown;
}): DeliverableNotification {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    metadata: (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>,
  };
}

/**
 * In-app channel. The engine already persisted the notification row, so delivery
 * is a success no-op — this provider exists so the delivery layer is uniform and
 * the manifest can list in-app alongside future channels.
 */
export const inAppNotificationProvider: NotificationProvider = {
  channel: "in_app",
  label: "In-app",
  isConfigured: () => true,
  deliver: async () => ({ ok: true, channel: "in_app" }),
};

const NOTIFICATION_PROVIDERS: Partial<Record<NotificationChannel, NotificationProvider>> = {
  in_app: inAppNotificationProvider,
};

/**
 * Resolve a configured notification provider. Only `in_app` is implemented; the
 * other channels are recognized ids that throw a clear error until registered.
 */
export function resolveNotificationProvider(channel: NotificationChannel | string | null | undefined): NotificationProvider {
  const provider = NOTIFICATION_PROVIDERS[(channel ?? "in_app") as NotificationChannel];
  if (!provider) throw new Error(`NOTIFICATION_PROVIDER_NOT_CONFIGURED: ${channel}`);
  return provider;
}

/** Deliver over a provider, skipping (not failing) when the channel is unconfigured. */
export async function deliverNotification(
  provider: NotificationProvider,
  n: DeliverableNotification,
): Promise<DeliveryResult> {
  if (!provider.isConfigured()) return { ok: true, channel: provider.channel, skipped: true };
  return provider.deliver(n);
}
