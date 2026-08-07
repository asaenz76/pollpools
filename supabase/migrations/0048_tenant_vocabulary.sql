-- ----------------------------------------------------------------------------
-- 0048_tenant_vocabulary — Phase 8B.1: tenant-configurable vocabulary.
--
-- Presentation-only naming. Each tenant may re-label the engine's generic
-- concepts (competitor / event / market / prediction / season / draft / …) for
-- its audience without any schema change or UI fork. Stored as a partial JSONB
-- map { key: { singular, plural } }; the resolver (src/lib/vocabulary) layers it
-- over English defaults, so an empty object means "use the platform defaults".
-- Additive, backwards-compatible: existing rows default to '{}'.
-- ----------------------------------------------------------------------------

alter table tenant_settings
  add column if not exists vocabulary jsonb not null default '{}'::jsonb;

comment on column tenant_settings.vocabulary is
  'Tenant vocabulary overrides (presentation only): { conceptKey: { singular, plural } }. '
  'Engine tables/concepts stay generic; see src/lib/vocabulary.';
