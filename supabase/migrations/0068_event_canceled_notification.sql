-- ============================================================================
-- 0068_event_canceled_notification — Creator Event Lifecycle (EVT).
--
-- Adds a single user-facing notification type, `event_canceled`, emitted to
-- participants when a creator cancels an event they predicted on. Postgres
-- forbids using a freshly-added enum value in the same transaction that adds it,
-- so — following the established pattern (0041, 0059) — the ADD VALUE lives in
-- its own standalone migration, ahead of 0069 which references it.
--
-- No other lifecycle transition needs a new notification type: "result
-- available" (prediction_correct / prediction_incorrect) and "result corrected"
-- (prediction_updated) already exist and are reused verbatim; a lock notice is
-- intentionally NOT added (spec: only if already supported — it is not).
-- ============================================================================

alter type notification_type add value if not exists 'event_canceled';
