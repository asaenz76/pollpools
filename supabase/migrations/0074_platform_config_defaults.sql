-- ============================================================================
-- 0074_platform_config_defaults — production-safe platform config (PL.5 §19).
--
-- Production applies MIGRATIONS ONLY (never the dev seed), so the platform name
-- must resolve correctly from migrations alone. The schema default was the legacy
-- 'Prediction Engine'; the product name is 'Poll Pools'. This establishes that
-- safely and idempotently WITHOUT clobbering a customized value:
--   • ensure the singleton row exists,
--   • set the column default to 'Poll Pools',
--   • update ONLY rows still holding the old default (a customized name is left
--     untouched).
-- No tenant identity (e.g. Marble Grand Prix) ever goes in platform config.
-- ============================================================================

insert into platform_config (id) values (true) on conflict (id) do nothing;

alter table platform_config alter column platform_name set default 'Poll Pools';

update platform_config set platform_name = 'Poll Pools' where platform_name = 'Prediction Engine';
