# Growth Engine (Phase 8-B.5)

The Growth Engine encourages tenants to grow and rewards them automatically. It
spans Revenue Plans (economics), WAU (the growth signal), automation, dashboards,
and notifications.

## Weekly Active Users (GRE.2)

WAU is the primary growth signal, defined by **configuration** on `platform_config`
(no hard-coded thresholds): enabled signals (prediction / draft / login), the window
(`wau_window_days`), and `wau_min_actions`. Computed set-based from
`predictions.submitted_at`, confirmed `competitor_draft_assignments`, and a
lightweight `tenant_user_activity` login rollup (stamped idempotently per day from
the session via `record_tenant_activity`, using `auth.uid()` so a user can only stamp
their own activity). `tenant_wau_current` returns current + previous window; the
admin-only `tenant_wau_at` is parameterized.

## Scheduled jobs

- `/api/internal/growth/evaluate` (daily) → `evaluate_all_tenant_plans`.
- `/api/internal/growth/health-snapshot` (daily) → `snapshot_all_community_health`
  then `detect_all_success_milestones`.

Both authenticate via `CRON_SECRET`, mirroring the existing job/monitor endpoints.

## Notifications (GRE.7)

Emitted by **triggers** on the state changes (the tested evaluate/snapshot functions
are untouched), so they cannot drift from reality:

| Event | Type | Tone |
| --- | --- | --- |
| Upgrade | `plan_upgraded` | celebratory |
| At Risk | `plan_at_risk` | helpful |
| Recovery | `plan_recovered` | positive |
| Downgrade | `plan_downgraded` | factual, non-punitive |
| WAU milestone | `wau_milestone` | positive |
| Health band up | `health_band_improved` | coaching |
| Health drop | `health_needs_attention` | coaching |

Anti-spam is the notifications table's unique `(tenant_id, dedupe_key)` — one message
per transition. Copy never implies Community Health controls the plan.

## Tenant Growth Dashboard (GRE.5)

`/t/[slug]/creator/growth`, in priority order: This Period → Current Plan + Next
Milestone → Community Health → Platform Status → Success Timeline. Next Milestone uses
Revenue-Plan criteria only. See [community-health.md](community-health.md).

## Super Admin (GRE.6)

`/admin/growth` — all-tenant overview + filters, manual override, evaluate-now;
`/admin/growth/plans` — plan + share + qualification config; `/admin/growth/health` —
metric + WAU config. All mutations are super-admin gated (RLS) and audited.
