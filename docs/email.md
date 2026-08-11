# Email Architecture

Two independent concerns — do not conflate them.

## A. Auth email (Supabase)
Sign-up confirmation, password reset, and other auth messages are sent by **Supabase
Auth**, configured with **custom SMTP** pointing at Resend. This is INFRASTRUCTURE:
application code cannot configure it. Return URLs in these emails are built
server-side from the tenant's primary domain (`resolveTenantHomeUrl`) — never a
client value — but Supabase's redirect allow-list must include those hosts (runbook
step 19). **Production setup:** create Resend account → verify sending domain
(SPF + DKIM; DMARC recommended) → set Supabase Auth → SMTP to Resend → test a real
password reset (runbook steps 11–14). Do not claim auth email works until a real
send is verified.

## B. Application notification email (Poll Pools)
The engine always writes the in-app `notifications` row; email is an added DELIVERY
channel behind the existing `NotificationProvider` interface — no forked notification
logic. Wiring (PL.3):

```
notifications INSERT
  → trigger app.on_notification_email_enqueue (0072)   [platform switch + eligible type + user opt-in]
  → system_jobs 'notification.email' (deduped by notification id)   [no second queue]
  → worker → deliverEmailNotification → EmailNotificationProvider → transport (Resend)
  → notification_deliveries state (pending → sent | skipped | failed)
```

Guarantees: **idempotent** (a retry never re-sends a `sent` message); **retries +
dead-letter** via `system_jobs`; **respects preferences** (`platform_config.email_delivery_enabled`
master switch, default off; per-user `user_notification_preferences.email_enabled`,
default off/opt-in); **safe when unconfigured** (no transport → `skipped`, never a
fake send); **settlement-independent** (email runs in its own job/txn and can never
affect grading/projections).

**Transport (Resend):** set `RESEND_API_KEY` + `EMAIL_FROM` (server env). The generic
`createHttpEmailTransport` posts `{from,to,subject,text}` to `https://api.resend.com/emails`
with Bearer auth — Resend-compatible, no new dependency. `EMAIL_API_*` is a fallback.

**Enable in production:** set the transport env vars, then
`update platform_config set email_delivery_enabled = true;`. Users opt in per
preference. **Test:** trigger an eligible notification for a real inbox; verify
delivery + `notification_deliveries.status='sent'`; verify a forced failure records
`failed` and the job retries/dead-letters.

Eligible types (curated, extend deliberately): result/corrected, event canceled,
achievement earned, creator support started, plan changes, health needs-attention,
bracket advancement, competition starting, subscription failed. Per-tick churn
(draft rank changes) is intentionally excluded.
