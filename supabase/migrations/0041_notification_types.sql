-- ============================================================================
-- 0041 — Phase 7.5 §5F: new notification types (added alone; a new enum value
-- cannot be used in the same transaction it is created in, so §5F's logic lives
-- in 0042).
--   prediction_updated    — a corrected prediction outcome after a regrade
--                           (distinguishable from the original result).
--   leaderboard_milestone — reached a configured leaderboard milestone.
-- ============================================================================
alter type notification_type add value if not exists 'prediction_updated';
alter type notification_type add value if not exists 'leaderboard_milestone';
