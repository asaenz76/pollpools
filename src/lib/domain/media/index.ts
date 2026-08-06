/**
 * Generic event-media boundary (Phase 7.6 §4–§5).
 *
 * Media is an OPTIONAL external link a creator may attach to an event. The engine
 * stays platform-neutral: `provider` is an open registry value (adding a platform
 * needs no engine migration), and the only thing embedded inline is YouTube (a
 * stable, CSP-allowed embed). Every other platform is treated as a safe external
 * "Watch" link — we never fabricate unreliable embed support, and never inject
 * creator-supplied HTML. When in doubt the UX always works via an external link.
 */
import { parseYouTubeId, youtubeEmbedUrl } from "@/lib/domain/youtube";
import type { EventMediaType } from "@/types/enums";

/** Known providers for detection/labeling. Open set — `external`/`other` catch the rest. */
const KNOWN_PROVIDERS: { id: string; label: string; hosts: string[] }[] = [
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com", "m.youtube.com"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com", "vm.tiktok.com"] },
  { id: "twitch", label: "Twitch", hosts: ["twitch.tv", "m.twitch.tv"] },
  { id: "vimeo", label: "Vimeo", hosts: ["vimeo.com", "player.vimeo.com"] },
  { id: "kick", label: "Kick", hosts: ["kick.com"] },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.watch"] },
  { id: "instagram", label: "Instagram", hosts: ["instagram.com"] },
];

/** All provider ids the platform recognizes (registry, not a closed engine enum). */
export const SUPPORTED_MEDIA_PROVIDERS = [...KNOWN_PROVIDERS.map((p) => p.id), "external", "other"] as const;
export type MediaProviderId = string;

export type ValidatedUrl = { ok: true; url: URL } | { ok: false; error: string };

/** Only http(s) URLs are ever accepted — blocks javascript:/data: and malformed input. */
export function validateMediaUrl(raw: string | null | undefined): ValidatedUrl {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "Enter a media URL." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "Enter a valid URL (including https://)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) links are allowed." };
  }
  return { ok: true, url };
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

/** Detect the provider id from a URL host; unknown hosts → "external". */
export function detectProvider(url: URL): MediaProviderId {
  const host = hostOf(url);
  for (const p of KNOWN_PROVIDERS) {
    if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p.id;
  }
  return "external";
}

/** Human label for a provider id. */
export function providerLabel(id: MediaProviderId): string {
  return KNOWN_PROVIDERS.find((p) => p.id === id)?.label ?? (id === "external" ? "External link" : "Link");
}

export type ResolvedMedia = {
  provider: MediaProviderId;
  providerLabel: string;
  /** Safe to render as an inline iframe (YouTube only in v1). */
  canEmbed: boolean;
  /** Embed src when canEmbed, else null → render an external link. */
  embedUrl: string | null;
  /** The original external URL (always usable as a "Watch" link). */
  url: string;
};

/**
 * Resolve a stored/entered media URL into render instructions. Returns null only
 * when the URL is not a valid http(s) link. `providerHint` (a stored provider id)
 * is trusted for labeling but embedding is still gated on what we can do safely.
 */
export function resolveEventMedia(rawUrl: string, providerHint?: string | null): ResolvedMedia | null {
  const v = validateMediaUrl(rawUrl);
  if (!v.ok) return null;
  const provider = (providerHint && providerHint !== "external" ? providerHint : detectProvider(v.url)) || "external";
  // v1: only YouTube embeds inline (stable, CSP-allowed). Everything else is an
  // external link — no fabricated embeds.
  const ytId = provider === "youtube" ? parseYouTubeId(v.url.toString()) : null;
  const canEmbed = ytId !== null;
  return {
    provider,
    providerLabel: providerLabel(provider),
    canEmbed,
    embedUrl: ytId ? youtubeEmbedUrl(ytId) : null,
    url: v.url.toString(),
  };
}

/** Default "Watch" label given provider + media type. Pure UI copy helper. */
export function watchLabel(provider: MediaProviderId, mediaType: EventMediaType): string {
  const name = providerLabel(provider);
  if (mediaType === "video") return provider === "external" ? "Watch replay" : `Watch replay on ${name}`;
  if (mediaType === "event_page") return "View event page";
  if (mediaType === "social_post") return `View on ${name}`;
  // livestream / other
  return provider === "external" ? "Watch the stream" : `Watch live on ${name}`;
}
