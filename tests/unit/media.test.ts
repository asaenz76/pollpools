import { describe, it, expect } from "vitest";
import { validateMediaUrl, detectProvider, resolveEventMedia, watchLabel, SUPPORTED_MEDIA_PROVIDERS } from "@/lib/domain/media";

/** Generic event-media boundary (§4–§5): validation, provider detection, safe embed/external fallback. */
describe("media url validation", () => {
  it("accepts http(s) URLs", () => {
    expect(validateMediaUrl("https://youtube.com/watch?v=abc123").ok).toBe(true);
    expect(validateMediaUrl("http://example.com/live").ok).toBe(true);
  });
  it("rejects blank, malformed, and non-http(s) schemes (no javascript:/data:)", () => {
    expect(validateMediaUrl("").ok).toBe(false);
    expect(validateMediaUrl("   ").ok).toBe(false);
    expect(validateMediaUrl("not a url").ok).toBe(false);
    expect(validateMediaUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateMediaUrl("data:text/html,<script>").ok).toBe(false);
    expect(validateMediaUrl("ftp://host/file").ok).toBe(false);
  });
});

describe("provider detection", () => {
  const cases: [string, string][] = [
    ["https://www.youtube.com/watch?v=aqz-KE-bpKQ", "youtube"],
    ["https://youtu.be/aqz-KE-bpKQ", "youtube"],
    ["https://www.tiktok.com/@x/live", "tiktok"],
    ["https://www.twitch.tv/somechannel", "twitch"],
    ["https://vimeo.com/12345", "vimeo"],
    ["https://kick.com/somechannel", "kick"],
    ["https://www.facebook.com/x/videos/1", "facebook"],
    ["https://www.instagram.com/x/live", "instagram"],
    ["https://example.com/my-stream", "external"],
  ];
  for (const [url, provider] of cases) {
    it(`${url} → ${provider}`, () => {
      const v = validateMediaUrl(url);
      expect(v.ok && detectProvider(v.url)).toBe(provider);
    });
  }
  it("every known provider id is in the registry", () => {
    for (const id of ["youtube", "tiktok", "twitch", "vimeo", "kick", "facebook", "instagram", "external", "other"]) {
      expect(SUPPORTED_MEDIA_PROVIDERS).toContain(id);
    }
  });
});

describe("resolveEventMedia", () => {
  it("embeds YouTube inline via the privacy-enhanced (nocookie) domain — never arbitrary HTML", () => {
    const r = resolveEventMedia("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    expect(r?.canEmbed).toBe(true);
    expect(r?.embedUrl).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/[a-zA-Z0-9_-]+$/);
    expect(r?.provider).toBe("youtube");
  });
  it("falls back to an external link for providers without a safe embed (TikTok, Twitch, unknown)", () => {
    for (const url of ["https://www.tiktok.com/@x/live", "https://www.twitch.tv/x", "https://example.com/stream"]) {
      const r = resolveEventMedia(url);
      expect(r?.canEmbed).toBe(false);
      expect(r?.embedUrl).toBeNull();
      expect(r?.url).toBe(new URL(url).toString());
    }
  });
  it("returns null for an invalid URL", () => {
    expect(resolveEventMedia("javascript:alert(1)")).toBeNull();
  });
  it("produces sensible watch labels", () => {
    expect(watchLabel("youtube", "livestream")).toMatch(/live/i);
    expect(watchLabel("external", "video")).toMatch(/replay/i);
    expect(watchLabel("twitch", "event_page")).toMatch(/event page/i);
  });
});
