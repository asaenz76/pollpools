# Event media (generic, optional)

Phase 7.6 removed the mandatory YouTube dependency and replaced it with a generic,
optional media model. **An event is valid with no media at all.** A live/recorded
media link is *optional but recommended* — it gives livestream-driven tenants a
strong watch-along experience without forcing any product to depend on a specific
platform.

## Data model

`event_media_links` (one row per attached link):

| Column | Notes |
| --- | --- |
| `provider` | **open TEXT registry value** (`youtube`, `tiktok`, `twitch`, `vimeo`, `kick`, `facebook`, `instagram`, `external`, `other`, …). NOT an enum — a new platform needs no engine migration. |
| `media_type` | `event_media_type` enum: `livestream` / `video` / `event_page` / `social_post` / `other` (stable engine classification; drives embed vs. link UX). |
| `url` | required, `http(s)` only. |
| `label`, `thumbnail_url`, `is_primary`, `starts_at`, `ends_at`, `metadata` | optional; one primary per event (unique partial index). |

**RLS** is DB-level, not app-filter-only: published-event media is world-readable;
draft media is owner/admin-only; writes are restricted to the event's creator
owner (same tenant) or a super-admin.

## Provider boundary

`src/lib/domain/media` is a minimal MediaProvider boundary:

- `validateMediaUrl` — accepts only `http(s)` (blocks `javascript:`/`data:`).
- `detectProvider` — host → registry id (unknown → `external`).
- `resolveEventMedia` — **YouTube embeds inline** via the privacy-enhanced
  `youtube-nocookie.com` domain; **every other provider is a safe external link**.
  We do not fabricate unreliable embeds, and never inject creator-supplied HTML.

The event page renders an inline embed only when the provider is embeddable **and**
the tenant permits it (`inline_embeds_enabled`, `allowed_media_providers`);
otherwise a `target="_blank" rel="noopener noreferrer nofollow"` "Watch" link. No
autoplay. When an event has no media, no media section renders.

## Tenant configuration

`tenant_settings`: `event_media_enabled`, `event_media_optional`,
`external_media_links_enabled`, `inline_embeds_enabled`, `allowed_media_providers`
(empty = all), `preferred_media_provider`. Defaults: media enabled + optional,
external links + inline embeds allowed, no preferred provider. **YouTube is not a
default requirement.**

## Legacy `events.youtube_url` — removal plan

Migration `0045` copied every non-empty `events.youtube_url` into a **primary
`youtube` media row** (idempotent). The `youtube_url` column is **retained
temporarily** for backward compatibility and is no longer written by the generic
creation path (`create_event_with_market` dropped its `p_youtube_url` parameter).

**Removal (a future migration, once no read path references it):**
1. Confirm all reads use `event_media_links` (done: `get-event` reads `media[]`).
2. Verify the migration coverage invariant holds (asserted in
   `tests/integration/event-media.test.ts`: every legacy `youtube_url` has a media
   row).
3. Drop `events.youtube_url` and the deprecated `youtubeUrl` field on `EventDetail`.

See also: [settlement.md](settlement.md), [configuration.md](configuration.md).
