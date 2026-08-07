/**
 * Event providers (Phase 8B.4).
 *
 * Event creation is separated from the event SOURCE behind an EventProvider: it
 * validates and normalizes a raw, source-specific submission into the engine's
 * canonical event-creation payload. Architecture only — the single implementation
 * is `manual` (a creator filling in the studio form); imported/api providers plug
 * into the same interface later without touching the create-event engine.
 *
 * The engine authority is unchanged: events are still created through the
 * existing `create_event_with_market` RPC. A provider only shapes input — media
 * links stay OPTIONAL and publication is never blocked by their absence.
 */
import { z } from "zod";
import { validateMediaUrl, detectProvider } from "@/lib/domain/media";
import { slugify } from "@/lib/domain/slug";
import { EVENT_MEDIA_TYPE } from "@/types/enums";

export type EventProviderId = "manual" | "imported" | "api";

export type NormalizedEventMedia = {
  url: string;
  provider: string;
  mediaType: string;
  label: string | null;
  isPrimary: boolean;
};

/** The engine's canonical event-creation payload, independent of the source. */
export type NormalizedEvent = {
  creatorId: string;
  competitionId: string | null;
  title: string;
  slug: string;
  description: string | null;
  startsAt: string | null;
  locksAt: string | null;
  competitorIds: string[];
  marketQuestion: string | null;
  publish: boolean;
  media: NormalizedEventMedia[];
};

export type EventValidation = { ok: true; value: NormalizedEvent } | { ok: false; error: string };

export interface EventProvider {
  readonly id: EventProviderId;
  readonly label: string;
  /** Validate + normalize a raw, source-specific submission into the canonical event. */
  validate(raw: unknown): EventValidation;
}

const uuid = z.string().uuid();

const mediaItemSchema = z.object({
  url: z.string().trim().min(1),
  provider: z.string().trim().max(40).optional(),
  mediaType: z.enum(EVENT_MEDIA_TYPE).optional(),
  label: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().optional(),
});

const manualEventSchema = z.object({
  creatorId: uuid,
  competitionId: uuid.nullable().optional(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  startsAt: z.string().optional(),
  locksAt: z.string().optional(),
  media: z.array(mediaItemSchema).max(10).optional(),
  competitorIds: z.array(uuid).min(2, "Select at least 2 competitors"),
  marketQuestion: z.string().trim().max(200).optional(),
  publish: z.boolean().default(true),
});

/** The manual studio form is the raw shape of the manual provider. */
export type ManualEventInput = z.input<typeof manualEventSchema>;

export const manualEventProvider: EventProvider = {
  id: "manual",
  label: "Manual entry",
  validate(raw) {
    const parsed = manualEventSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const d = parsed.data;

    // Validate + normalize any media links. A single link defaults to primary.
    const media: NormalizedEventMedia[] = [];
    for (const item of d.media ?? []) {
      const v = validateMediaUrl(item.url);
      if (!v.ok) return { ok: false, error: v.error };
      media.push({
        url: v.url.toString(),
        provider: item.provider?.trim() || detectProvider(v.url),
        mediaType: item.mediaType ?? "other",
        label: item.label ?? null,
        isPrimary: item.isPrimary ?? false,
      });
    }
    if (media.length === 1) media[0]!.isPrimary = true;
    if (media.filter((m) => m.isPrimary).length > 1) {
      return { ok: false, error: "Only one media link can be primary." };
    }

    return {
      ok: true,
      value: {
        creatorId: d.creatorId,
        competitionId: d.competitionId ?? null,
        title: d.title,
        slug: slugify(d.title),
        description: d.description ?? null,
        startsAt: d.startsAt || null,
        locksAt: d.locksAt || null,
        competitorIds: d.competitorIds,
        marketQuestion: d.marketQuestion || null,
        publish: d.publish,
        media,
      },
    };
  },
};

const EVENT_PROVIDERS: Record<string, EventProvider> = {
  manual: manualEventProvider,
};

/**
 * Resolve a configured event provider. Only `manual` is implemented; imported/api
 * are recognized ids that throw a clear error until an implementation is registered.
 */
export function resolveEventProvider(id: EventProviderId | string | null | undefined): EventProvider {
  const provider = EVENT_PROVIDERS[id ?? "manual"];
  if (!provider) throw new Error(`EVENT_PROVIDER_NOT_CONFIGURED: ${id}`);
  return provider;
}
