-- ============================================================================
-- 0062_feed_keyset_index — Phase 8-C F-18: index the feed keyset path.
--
-- The feed is now keyset-paginated by (created_at DESC, id DESC) within a tenant.
-- The existing idx_feed_tenant_time covers (tenant_id, created_at DESC) but not
-- the id tiebreak, so equal-timestamp pages can't be served purely from the
-- index. This composite index matches the query's exact ordering + cursor.
-- ============================================================================

create index if not exists idx_feed_tenant_keyset
  on feed_activities (tenant_id, created_at desc, id desc);
