-- ----------------------------------------------------------------------------
-- 0049_tenant_providers — Phase 8B.6: config-driven provider selection.
--
-- Which result / event / notification provider a tenant uses is CONFIGURATION,
-- not code — there is never a `switch(product)` or `if tenant == …`. A tenant may
-- name a provider id per family; the manifest (src/lib/providers) resolves each
-- id to its implementation, defaulting to the built-ins (manual / in_app). Media
-- provider preference already lives in tenant_settings (preferred_media_provider).
-- Additive, backwards-compatible: existing rows default to '{}' → all defaults.
--
-- Shape: { "result": "manual", "event": "manual", "notification": ["in_app"] }
-- ----------------------------------------------------------------------------

alter table tenant_settings
  add column if not exists providers jsonb not null default '{}'::jsonb;

comment on column tenant_settings.providers is
  'Config-driven provider selection: { result, event, notification[] } provider ids. '
  'Resolved by src/lib/providers manifest; empty means platform defaults.';
