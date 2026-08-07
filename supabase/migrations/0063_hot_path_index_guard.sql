-- ============================================================================
-- 0063_hot_path_index_guard — Phase 8-C F-20: assert the hot-read indexes exist.
--
-- All indexes below already exist (verified via EXPLAIN). This adds a boolean
-- guard so a critical index for the prediction/sentiment/feed hot paths can't be
-- dropped without a test noticing. Returns only a boolean (no schema is exposed);
-- service_role only. No new indexes are added speculatively — every one here
-- backs a real query path.
-- ============================================================================

create or replace function public.hot_path_indexes_ok()
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select
    exists(select 1 from pg_indexes where indexname = 'idx_predictions_market_status')   -- sentiment / status filters
    and exists(select 1 from pg_indexes where indexname = 'idx_predictions_option')       -- sentiment join
    and exists(select 1 from pg_indexes where indexname = 'idx_market_options_market')     -- batched options + join
    and exists(select 1 from pg_indexes where indexname = 'idx_feed_tenant_keyset')        -- feed keyset (F-18)
    and exists(                                                                            -- user prediction lookup
      select 1 from pg_indexes where tablename = 'predictions' and indexdef like '%(market_id, user_id)%'
    );
$$;
grant execute on function public.hot_path_indexes_ok() to service_role;
