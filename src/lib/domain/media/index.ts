/**
 * Generic event-media boundary (Phase 7.6 §4–§5; provider-based since 8B.2).
 *
 * Media is an OPTIONAL external link a creator may attach to an event. The engine
 * stays platform-neutral: `provider` is an open registry value (adding a platform
 * needs no engine migration), and only a provider that can render a safe,
 * CSP-allowed embed does so — every other platform degrades to a safe external
 * "Watch" link. This module keeps its function-shaped API for existing call sites
 * while delegating all provider knowledge to `src/lib/providers/media`.
 */
import {
  validateHttpUrl,
  resolveMediaProvider,
  providerForUrl,
  mediaProviderById,
  SUPPORTED_MEDIA_PROVIDERS,
  type MediaProviderId,
  type ValidatedUrl,
} from "@/lib/providers/media";
import type { EventMediaType } from "@/types/enums";

export { SUPPORTED_MEDIA_PROVIDERS };
export type { MediaProviderId, ValidatedUrl };

/** Only http(s) URLs are ever accepted — blocks javascript:/data: and malformed input. */
export function validateMediaUrl(raw: string | null | undefined): ValidatedUrl {
  return validateHttpUrl(raw);
}

/** Detect the provider id from a URL host; unknown hosts → "external". */
export function detectProvider(url: URL): MediaProviderId {
  return providerForUrl(url).id;
}

/** Human label for a provider id. */
export function providerLabel(id: MediaProviderId): string {
  return mediaProviderById(id).label;
}

export type ResolvedMedia = {
  provider: MediaProviderId;
  providerLabel: string;
  /** Neutral UI glyph for the provider. */
  icon: string;
  /** Safe to render as an inline iframe. */
  canEmbed: boolean;
  /** Embed src when canEmbed, else null → render an external link. */
  embedUrl: string | null;
  /** Best-effort thumbnail, or null. */
  thumbnailUrl: string | null;
  /** The original external URL (always usable as a "Watch" link). */
  url: string;
};

/**
 * Resolve a stored/entered media URL into render instructions. Returns null only
 * when the URL is not a valid http(s) link. `providerHint` (a stored provider id)
 * is trusted for labeling; embedding is still gated on what the provider can do
 * safely.
 */
export function resolveEventMedia(rawUrl: string, providerHint?: string | null): ResolvedMedia | null {
  const v = validateHttpUrl(rawUrl);
  if (!v.ok) return null;
  const provider = resolveMediaProvider({ url: v.url, providerId: providerHint });
  const embedUrl = provider.embedUrl(v.url);
  return {
    provider: provider.id,
    providerLabel: provider.label,
    icon: provider.icon,
    canEmbed: provider.canEmbed && embedUrl !== null,
    embedUrl,
    thumbnailUrl: provider.thumbnailUrl(v.url),
    url: v.url.toString(),
  };
}

/** Default "Watch" label given provider + media type. Pure UI copy helper. */
export function watchLabel(provider: MediaProviderId, mediaType: EventMediaType): string {
  return mediaProviderById(provider).watchLabel(mediaType);
}
