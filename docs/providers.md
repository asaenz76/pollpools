# Providers

Prediction Engine resolves its pluggable behaviors from **configuration**, never
from tenant-specific code. There is no `switch(product)` and no `if tenant == …`
anywhere. Each provider family has one interface and one or more implementations;
a tenant names the implementation id in config and the manifest resolves it.

All provider code lives in `src/lib/providers/`.

## Families

| Family | Interface | Built-in | Recognized-but-unconfigured | Selected via |
| --- | --- | --- | --- | --- |
| Media | `MediaProvider` (`media.ts`) | youtube (embeds), tiktok, twitch, vimeo, kick, facebook, instagram, external/other | — (open registry) | `tenant_settings.preferred_media_provider` (+ auto-detect per link) |
| Result | `ResultProvider` (`result.ts`) | `manual` | `api`, `webhook`, `csv` | `tenant_settings.providers.result` |
| Event | `EventProvider` (`event.ts`) | `manual` | `imported`, `api` | `tenant_settings.providers.event` |
| Notification | `NotificationProvider` (`notification.ts`) | `in_app` | `email`, `sms`, `push`, `discord`, `slack`, `webhook`, `whatsapp` | `tenant_settings.providers.notification[]` |

An "unconfigured" id is recognized but has no implementation yet. `result` and
`event` resolve **strictly** — naming an unimplemented id throws
`*_PROVIDER_NOT_CONFIGURED` so a misconfiguration fails loudly. Notification
channels resolve **leniently** — unimplemented channels are dropped and `in_app`
is always guaranteed.

## The manifest

`resolveTenantProviders(config)` (`src/lib/providers/index.ts`) turns a tenant's
provider config into a `TenantProviderManifest` (`result`, `event`,
`notifications[]`, `media`). It is resolved once per request in `TenantContext`
(`ctx.providers`).

## Design rules

- **One interface per family**, designed around the provider that exists today.
  Future providers plug into the same interface — no new abstraction per provider.
- **No duplicated logic.** Where a provider owns validation/normalization that a
  server action used to do inline (result, event), the action now delegates to the
  provider and the engine RPC (`settle_event`, `create_event_with_market`) is
  unchanged. The settlement engine is never touched.
- **Media is always optional.** Only a provider that can render a safe,
  CSP-allowed embed sets `canEmbed`; everything else degrades to an external link.
- **Notification production stays transport-independent.** The engine writes an
  in-app row and respects `user_notification_preferences`; delivery over other
  channels is the provider layer's job (finding F-22).

Adding an implementation: register it in its family module and (for result/event)
map its id; tenants opt in via config. See also `docs/versioning.md` for behavior
that is gated on the tenant's engine version rather than a provider.
