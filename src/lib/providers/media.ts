/**
 * Media providers (Phase 8B.2).
 *
 * A MediaProvider knows how to validate, embed, thumbnail, icon, and label media
 * for one platform. Media is always OPTIONAL — the engine never requires video;
 * a provider only shapes how an attached link is presented. Only providers that
 * can render a genuinely safe, CSP-allowed inline embed set `canEmbed` — every
 * other platform degrades to a safe external "Watch" link (we never fabricate an
 * embed or inject creator HTML).
 *
 * The set is an OPEN registry keyed by string id (adding a platform needs no
 * engine migration — `provider` on event_media_links is free text). This module
 * is the single source of truth; `src/lib/domain/media` delegates to it so the
 * existing call sites keep their function-shaped API.
 */
import { parseYouTubeId, youtubeEmbedUrl } from "@/lib/domain/youtube";
import type { EventMediaType } from "@/types/enums";

export type MediaProviderId = string;

export type ValidatedUrl = { ok: true; url: URL } | { ok: false; error: string };

/** http(s)-only validation shared by every provider — blocks javascript:/data:/etc. */
export function validateHttpUrl(raw: string | null | undefined): ValidatedUrl {
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

export interface MediaProvider {
  /** Open registry id (stored on event_media_links.provider). */
  readonly id: MediaProviderId;
  /** Human display label. */
  readonly label: string;
  /** Neutral UI glyph the display layer may render or override. */
  readonly icon: string;
  /** Hostnames this provider owns, for detection from a URL. */
  readonly hosts: readonly string[];
  /** True only when the provider renders a safe inline embed. */
  readonly canEmbed: boolean;
  /** Provider-specific validation (defaults to http(s)-only). */
  validate(rawUrl: string): ValidatedUrl;
  /** Safe inline embed src, or null when the provider is external-only. */
  embedUrl(url: URL): string | null;
  /** Best-effort thumbnail URL, or null. */
  thumbnailUrl(url: URL): string | null;
  /** "Watch"-style call to action for a media type. */
  watchLabel(mediaType: EventMediaType): string;
}

function defaultWatchLabel(label: string, isExternal: boolean, mediaType: EventMediaType): string {
  if (mediaType === "video") return isExternal ? "Watch replay" : `Watch replay on ${label}`;
  if (mediaType === "event_page") return "View event page";
  if (mediaType === "social_post") return isExternal ? "View post" : `View on ${label}`;
  // livestream / other
  return isExternal ? "Watch the stream" : `Watch live on ${label}`;
}

/** Build an external-link provider (no embed, no thumbnail) with shared defaults. */
function externalProvider(input: {
  id: string;
  label: string;
  icon: string;
  hosts: readonly string[];
}): MediaProvider {
  const isExternal = input.id === "external" || input.id === "other";
  return {
    id: input.id,
    label: input.label,
    icon: input.icon,
    hosts: input.hosts,
    canEmbed: false,
    validate: validateHttpUrl,
    embedUrl: () => null,
    thumbnailUrl: () => null,
    watchLabel: (mediaType) => defaultWatchLabel(input.label, isExternal, mediaType),
  };
}

const YOUTUBE: MediaProvider = {
  id: "youtube",
  label: "YouTube",
  icon: "▶",
  hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com", "m.youtube.com"],
  canEmbed: true,
  validate: validateHttpUrl,
  embedUrl: (url) => {
    const id = parseYouTubeId(url.toString());
    return id ? youtubeEmbedUrl(id) : null;
  },
  thumbnailUrl: (url) => {
    const id = parseYouTubeId(url.toString());
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  },
  watchLabel: (mediaType) => defaultWatchLabel("YouTube", false, mediaType),
};

/** The concrete registry. Order matters only for stable listing, not detection. */
const PROVIDERS: MediaProvider[] = [
  YOUTUBE,
  externalProvider({ id: "tiktok", label: "TikTok", icon: "♪", hosts: ["tiktok.com", "vm.tiktok.com"] }),
  externalProvider({ id: "twitch", label: "Twitch", icon: "◉", hosts: ["twitch.tv", "m.twitch.tv"] }),
  externalProvider({ id: "vimeo", label: "Vimeo", icon: "▶", hosts: ["vimeo.com", "player.vimeo.com"] }),
  externalProvider({ id: "kick", label: "Kick", icon: "◉", hosts: ["kick.com"] }),
  externalProvider({ id: "facebook", label: "Facebook", icon: "◈", hosts: ["facebook.com", "fb.watch"] }),
  externalProvider({ id: "instagram", label: "Instagram", icon: "◐", hosts: ["instagram.com"] }),
];

/** External fallback (unknown host) and the "other" alias. */
const EXTERNAL = externalProvider({ id: "external", label: "External link", icon: "↗", hosts: [] });
const OTHER = externalProvider({ id: "other", label: "Link", icon: "↗", hosts: [] });

const BY_ID = new Map<string, MediaProvider>([...PROVIDERS, EXTERNAL, OTHER].map((p) => [p.id, p]));

/** All provider ids the platform recognizes (registry, not a closed engine enum). */
export const SUPPORTED_MEDIA_PROVIDERS = [...PROVIDERS.map((p) => p.id), "external", "other"] as const;

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

/** Detect a provider from a URL host; unknown hosts resolve to the external provider. */
export function providerForUrl(url: URL): MediaProvider {
  const host = hostOf(url);
  for (const p of PROVIDERS) {
    if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p;
  }
  return EXTERNAL;
}

/**
 * Resolve the provider to use. A stored/known provider id wins (labeling is
 * trusted); otherwise detect from the URL. Falls back to the external provider.
 */
export function resolveMediaProvider(input: { url?: URL | null; providerId?: string | null }): MediaProvider {
  const { providerId, url } = input;
  if (providerId && providerId !== "external") {
    const known = BY_ID.get(providerId);
    if (known) return known;
  }
  if (url) return providerForUrl(url);
  return EXTERNAL;
}

/** Look up a provider by id (external fallback for unknown ids). */
export function mediaProviderById(id: MediaProviderId): MediaProvider {
  return BY_ID.get(id) ?? EXTERNAL;
}
