/**
 * Provider manifest (Phase 8B.6).
 *
 * A tenant's providers are resolved from CONFIGURATION, never from tenant-specific
 * code — there is no `switch(product)` or `if tenant == …` anywhere. Given a
 * tenant's provider config (a plain JSON object from tenant_settings), this
 * resolves the full set of implementations, defaulting to the built-ins. Adding a
 * future provider (an api result source, an email channel) means registering it in
 * its family module and naming its id in tenant config — no change here.
 */
import { mediaProviderById, type MediaProvider } from "@/lib/providers/media";
import { resolveResultProvider, type ResultProvider } from "@/lib/providers/result";
import { resolveEventProvider, type EventProvider } from "@/lib/providers/event";
import {
  resolveNotificationProvider,
  type NotificationProvider,
  type NotificationChannel,
} from "@/lib/providers/notification";

export type { MediaProvider, ResultProvider, EventProvider, NotificationProvider, NotificationChannel };

/** Raw provider selection as stored in tenant config (all optional). */
export type TenantProviderConfig = {
  result?: string | null;
  event?: string | null;
  notification?: string[] | null;
  /** Preferred media provider id (media is otherwise auto-detected per link). */
  media?: string | null;
};

export type TenantProviderManifest = {
  result: ResultProvider;
  event: EventProvider;
  /** Delivery channels, in configured order; always includes at least in_app. */
  notifications: NotificationProvider[];
  /** The tenant's preferred media provider, or null (auto-detect per link). */
  media: MediaProvider | null;
};

function coerceConfig(raw: unknown): TenantProviderConfig {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    result: typeof r.result === "string" ? r.result : null,
    event: typeof r.event === "string" ? r.event : null,
    notification: Array.isArray(r.notification) ? r.notification.filter((c): c is string => typeof c === "string") : null,
    media: typeof r.media === "string" ? r.media : null,
  };
}

/**
 * Resolve a tenant's provider manifest from its (possibly empty) config.
 *
 * result / event resolve strictly — a config naming an unimplemented provider
 * throws, because a misconfiguration should fail loudly rather than silently do
 * nothing. Notification channels resolve leniently — unimplemented channels are
 * dropped (the delivery layer treats an absent channel as "skip"), and in_app is
 * always guaranteed.
 */
export function resolveTenantProviders(rawConfig: unknown): TenantProviderManifest {
  const config = coerceConfig(rawConfig);

  const result = resolveResultProvider(config.result);
  const event = resolveEventProvider(config.event);

  const channels: NotificationChannel[] = (config.notification?.length ? config.notification : ["in_app"]) as NotificationChannel[];
  const seen = new Set<string>();
  const notifications: NotificationProvider[] = [];
  for (const channel of channels) {
    if (seen.has(channel)) continue;
    seen.add(channel);
    try {
      notifications.push(resolveNotificationProvider(channel));
    } catch {
      // Unimplemented channel configured — skip it (not deliverable yet).
    }
  }
  if (!notifications.some((p) => p.channel === "in_app")) {
    notifications.unshift(resolveNotificationProvider("in_app"));
  }

  const media = config.media ? mediaProviderById(config.media) : null;

  return { result, event, notifications, media };
}
