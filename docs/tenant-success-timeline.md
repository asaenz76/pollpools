# Tenant Success Timeline (Phase 8-B.5 GRE.5)

A celebration of meaningful, **positive** progress — not an activity feed, audit log,
or billing history.

## Model

`tenant_success_timeline` (permanent, append-only): type, category, title,
description, icon_key, occurred_at, metadata, visibility, is_pinned,
is_shareable_eligible, `dedupe_key` (unique per tenant). Entries are never rewritten;
a milestone that recurs at a new level appends a new entry.

Categories: revenue_plan, community_health, audience, competitions, draft, support,
platform, achievements.

## Detection

`detect_success_milestones(tenant)` is deterministic and idempotent (dedupe_key),
derived entirely from existing state. It runs after the daily health snapshot and
on-demand when the dashboard loads. **Positive only** — downgrades and routine
actions never create an entry.

Detected: revenue-plan reached (upgrades), WAU thresholds (100/500/1000/5000/10000),
Community Health personal best, first / 100 supporters, first / 100 Draft
participants, first completed competition, custom domain verified, one year on the
platform.

## UI

Grouped by month, category filters, pinned entries. "Celebrate publicly" is supported
architecturally (`is_shareable_eligible`) but sharing is intentionally not wired up
yet. The Super Admin can view (never edit) tenant timelines.
