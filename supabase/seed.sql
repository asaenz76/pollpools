-- ============================================================================
-- seed.sql — applied by `supabase db reset`.
-- Phase 1: create the reference tenant (marble racing) with branding, settings,
-- and feature flags so the app has a live community to render. Creators,
-- competitors, competitions, and results are seeded later (Phase 9).
-- ============================================================================

insert into tenants (id, slug, display_name, tagline, description, status, default_timezone, theme)
values (
  '00000000-0000-4000-a000-000000000001',
  'marbles',
  'Marble Grand Prix',
  'Call the marble that crosses the line first.',
  'Predict the winners of marble races, build your streak, and climb the community leaderboards. Free to play.',
  'active',
  'UTC',
  '{"accent":"#4f46e5"}'::jsonb
)
on conflict (slug) do nothing;

insert into tenant_settings (tenant_id, sentiment_visibility, small_participation_display)
values ('00000000-0000-4000-a000-000000000001', 'always', true)
on conflict (tenant_id) do nothing;

-- Feature flags for the reference tenant (mirrors sensible defaults).
insert into tenant_feature_flags (tenant_id, flag, enabled)
values
  ('00000000-0000-4000-a000-000000000001', 'predictions_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'comments_enabled', false),
  ('00000000-0000-4000-a000-000000000001', 'likes_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'sharing_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'creator_following_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'achievements_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'global_leaderboard_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'creator_leaderboards_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'season_leaderboards_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'platform_premium_enabled', false),
  ('00000000-0000-4000-a000-000000000001', 'creator_support_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'sponsorships_enabled', false),
  ('00000000-0000-4000-a000-000000000001', 'youtube_embeds_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'prediction_editing_before_lock_enabled', true),
  ('00000000-0000-4000-a000-000000000001', 'public_profiles_enabled', true)
on conflict (tenant_id, flag) do nothing;
