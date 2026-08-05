/**
 * Canonical domain enums for Prediction Engine.
 *
 * These mirror the Postgres ENUM types created in the migrations. They are the
 * generic, sport-agnostic vocabulary of the platform — nothing here names a
 * specific vertical (no "marble", "team", "horse", etc.). Vertical specifics
 * live only in competitor rows, option labels, and JSONB metadata.
 *
 * Keep this file and the SQL enum definitions in lockstep.
 */

export const TENANT_STATUS = ["active", "suspended", "archived"] as const;
export type TenantStatus = (typeof TENANT_STATUS)[number];

/** Platform-level account status. Per-tenant suspension is on the membership. */
export const USER_STATUS = ["active", "suspended", "deleted"] as const;
export type UserStatus = (typeof USER_STATUS)[number];

/** Global role concept. Exactly three per spec — do not add more in V1. */
export const GLOBAL_ROLE = ["super_admin", "creator", "user"] as const;
export type GlobalRole = (typeof GLOBAL_ROLE)[number];

/** Role scoped to a single tenant membership. */
export const MEMBERSHIP_ROLE = ["member", "creator", "admin"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLE)[number];

export const MEMBERSHIP_STATUS = ["active", "suspended", "removed"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

export const CREATOR_VERIFICATION_STATUS = [
  "unsubmitted",
  "pending",
  "verified",
  "rejected",
  "suspended",
] as const;
export type CreatorVerificationStatus =
  (typeof CREATOR_VERIFICATION_STATUS)[number];

export const COMPETITION_TYPE = [
  "STANDALONE_EVENT",
  "SEASON",
  "TOURNAMENT",
  "BRACKET",
] as const;
export type CompetitionType = (typeof COMPETITION_TYPE)[number];

export const COMPETITION_STATUS = [
  "draft",
  "scheduled",
  "active",
  "completed",
  "canceled",
  "archived",
] as const;
export type CompetitionStatus = (typeof COMPETITION_STATUS)[number];

/** Type of a stage within a tournament/bracket. Sequence is stored separately. */
export const STAGE_KIND = [
  "qualifier",
  "group_stage",
  "round_of_64",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "final",
  "custom",
] as const;
export type StageKind = (typeof STAGE_KIND)[number];

/**
 * Explicit event state machine. Transitions are guarded in the domain layer.
 * draft → scheduled → published → open → locked → live → waiting_result
 *   → settlement_pending → settled ; with canceled/voided as terminal escapes.
 */
export const EVENT_STATUS = [
  "draft",
  "scheduled",
  "published",
  "open",
  "locked",
  "live",
  "waiting_result",
  "settlement_pending",
  "settled",
  "canceled",
  "voided",
] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

export const MARKET_TYPE = [
  "SINGLE_CHOICE_WINNER",
  "YES_NO",
  "MULTIPLE_CHOICE",
] as const;
export type MarketType = (typeof MARKET_TYPE)[number];

export const MARKET_STATUS = [
  "draft",
  "open",
  "locked",
  "settled",
  "canceled",
  "voided",
] as const;
export type MarketStatus = (typeof MARKET_STATUS)[number];

export const OPTION_STATUS = [
  "active",
  "withdrawn",
  "voided",
  "winner",
  "loser",
] as const;
export type OptionStatus = (typeof OPTION_STATUS)[number];

/**
 * Prediction lifecycle:
 * active (editable pre-lock, if enabled) → locked (immutable) →
 * correct | incorrect | void (set by settlement; regrade may move between these
 * via new settlement versions).
 */
export const PREDICTION_STATUS = [
  "active",
  "locked",
  "correct",
  "incorrect",
  "void",
] as const;
export type PredictionStatus = (typeof PREDICTION_STATUS)[number];

export const SETTLEMENT_STATUS = [
  "pending",
  "active",
  "reversed",
  "superseded",
  "failed",
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUS)[number];

export const RESULT_SOURCE_TYPE = [
  "creator_manual",
  "super_admin_manual",
  "external_provider",
  "webhook",
  "future_adapter",
] as const;
export type ResultSourceType = (typeof RESULT_SOURCE_TYPE)[number];

export const SENTIMENT_VISIBILITY = [
  "always",
  "after_prediction",
  "after_lock",
] as const;
export type SentimentVisibility = (typeof SENTIMENT_VISIBILITY)[number];

export const SUBSCRIPTION_STATUS = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

export const SUBSCRIPTION_PRODUCT_KIND = [
  "platform_premium",
  "creator_support",
] as const;
export type SubscriptionProductKind =
  (typeof SUBSCRIPTION_PRODUCT_KIND)[number];

export const SPONSORSHIP_STATUS = [
  "draft",
  "active",
  "completed",
  "canceled",
] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUS)[number];

export const LEADERBOARD_SCOPE = [
  "global",
  "creator",
  "competition",
  "season",
] as const;
export type LeaderboardScope = (typeof LEADERBOARD_SCOPE)[number];

export const FEED_ACTIVITY_TYPE = [
  "creator_published_event",
  "user_submitted_prediction",
  "user_earned_achievement",
  "user_reached_streak_milestone",
  "event_settled",
  "user_leaderboard_move",
  "creator_published_result",
  "sponsored_event_published",
] as const;
export type FeedActivityType = (typeof FEED_ACTIVITY_TYPE)[number];

export const NOTIFICATION_TYPE = [
  "new_creator_event",
  "prediction_opening",
  "prediction_locking_soon",
  "event_result_published",
  "prediction_correct",
  "prediction_incorrect",
  "achievement_earned",
  "streak_milestone",
  "leaderboard_milestone",
  "creator_followed",
  "creator_support_started",
  "creator_support_renewed",
  "subscription_failed",
  "competition_starting",
  "bracket_advancement",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];
