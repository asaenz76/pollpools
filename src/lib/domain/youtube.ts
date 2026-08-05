/**
 * YouTube helpers (spec §19). We only ever store URLs and embed via the
 * privacy-enhanced nocookie domain (allowed by the CSP). No uploads, no
 * streaming — YouTube stays the video platform.
 */

/** Extract a YouTube video id from common URL shapes, or null. */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return sanitize(u.pathname.slice(1));
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") return sanitize(u.searchParams.get("v"));
      if (u.pathname.startsWith("/embed/")) return sanitize(u.pathname.slice(7));
      if (u.pathname.startsWith("/live/")) return sanitize(u.pathname.slice(6));
      if (u.pathname.startsWith("/shorts/")) return sanitize(u.pathname.slice(8));
    }
  } catch {
    return null;
  }
  return null;
}

function sanitize(id: string | null): string | null {
  if (!id) return null;
  return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
}

/** Privacy-enhanced embed URL for a video id. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
