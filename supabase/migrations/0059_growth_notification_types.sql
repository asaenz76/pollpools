-- ============================================================================
-- 0059_growth_notification_types — Phase 8-B.5 GRE.7: growth notification kinds.
-- Added in their own migration so the new enum values are committed before the
-- 0060 triggers use them (Postgres forbids using a new enum value in the same
-- transaction that adds it). Mirrored in src/types/enums.ts.
-- ============================================================================

alter type notification_type add value if not exists 'plan_upgraded';
alter type notification_type add value if not exists 'plan_at_risk';
alter type notification_type add value if not exists 'plan_recovered';
alter type notification_type add value if not exists 'plan_downgraded';
alter type notification_type add value if not exists 'health_band_improved';
alter type notification_type add value if not exists 'health_needs_attention';
alter type notification_type add value if not exists 'wau_milestone';
