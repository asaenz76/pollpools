-- ----------------------------------------------------------------------------
-- 0051_white_label — Phase 8B.8: white-label platform brand + footer toggle.
--
-- The platform's own brand name is CONFIGURATION, never hardcoded (a neutral
-- default). A tenant may hide the "Powered by <platform>" footer for a fully
-- white-labelled surface. Logo / favicon / theme white-label fields already exist
-- on tenants (logo_url, icon_url, theme). Additive + backwards-compatible.
-- ----------------------------------------------------------------------------

alter table platform_config
  add column if not exists platform_name text not null default 'Prediction Engine';

comment on column platform_config.platform_name is
  'Platform brand name (configuration, never hardcoded). Used in the "Powered by" footer.';

alter table tenant_settings
  add column if not exists show_powered_by boolean not null default true;

comment on column tenant_settings.show_powered_by is
  'When false, the tenant surface hides the "Powered by <platform>" footer (white label).';
