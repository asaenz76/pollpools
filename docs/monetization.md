# Monetization & Billing (Phase 7)

Optional, provider-neutral monetization. **Nothing here is wagering.** There is no
wallet, stored value, odds, or payout tied to prediction outcomes. Money never
touches prediction scoring, draft standings, settlement, or community sentiment.
Free Open Predictions are always available regardless of billing state.

Three products exist, all optional:

| Product | Type | What it grants |
| --- | --- | --- |
| **Platform Premium** | `platform_premium` | A per-user platform entitlement (advanced analytics, history, premium profile). |
| **Creator Support** | `creator_support` | A supporter entitlement scoped to one creator; generates a creator earning. |
| **Paid Competitor Draft** | `paid_competitor_draft` | A paid draft entry. **Gated off** by default (see below). |

## Provider abstraction

The app never imports a payment SDK outside the adapter layer. Everything speaks
the provider-neutral contract in `src/lib/billing/`:

- **`types.ts`** — domain types (`BillingCheckout`, `BillingOrder`,
  `BillingSubscription`, `BillingRefund`, `BillingWebhookEvent`, …). No provider
  field names leak past this boundary.
- **`provider.ts`** — the `BillingProvider` interface (`createCheckout`,
  `retrieve*`, `cancel/resume/changeSubscription`, `refundOrder`,
  `verifyWebhookSignature`, `parseWebhookEvent`, `healthCheck`) plus
  `BillingError` / `BillingUnsupportedError`.
- **`lemon-squeezy-provider.ts`** — the Lemon Squeezy adapter (server-only REST
  calls to `api.lemonsqueezy.com/v1`; maps LS statuses/events into domain types).
- **`mock-provider.ts`** — a fully signed mock used in dev/test that drives the
  entire pipeline (checkout → signed webhook → order → entitlement) with no live
  processor.
- **`manual`** — invoice/sponsorship style, handled through the accounting tables
  rather than a hosted checkout.
- **`index.ts`** — `getBillingProvider()` selects the adapter from
  `BILLING_PROVIDER`. Server-only.

Swapping providers is a config change plus one adapter file. No call site changes.

## Configuration

```bash
BILLING_PROVIDER=mock                 # lemon_squeezy | mock | manual
BILLING_WEBHOOK_SECRET=<long-random>  # signs/verifies mock webhooks
PAID_DRAFT_CHECKOUT_ENABLED=false     # production gate for paid drafts

# Required only when BILLING_PROVIDER=lemon_squeezy (server-only; never NEXT_PUBLIC_):
LEMON_SQUEEZY_API_KEY=
LEMON_SQUEEZY_STORE_ID=
LEMON_SQUEEZY_WEBHOOK_SECRET=
LEMON_SQUEEZY_TEST_MODE=true
LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID=
LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID=
LEMON_SQUEEZY_PAID_DRAFT_VARIANT_ID=
```

Prices, currencies, and product identifiers are **always read server-side** from
`billing_products`. The client sends only a product/creator reference; it can
never dictate an amount, currency, or provider variant id.

## Checkout

1. A signed-in member clicks a checkout button (`CheckoutButton`).
2. `startCheckoutAction` (`src/lib/domain/billing-actions.ts`) calls
   `create_billing_checkout` — a SECURITY DEFINER function that resolves the
   product for the **URL-resolved tenant**, verifies membership, stamps the price
   from the server, and returns a `billing_checkouts` row (idempotent per user +
   product + pending checkout).
3. The adapter's `createCheckout` produces the hosted-pay URL; the action stores
   it via `set_billing_checkout_url` and redirects the browser there.
4. The provider hosts payment. **The redirect back never grants anything.**

With the mock provider, `/api/billing/mock/pay` simulates the hosted page: it
constructs a **signed** `order_created` (plus `subscription_created` for
recurring products), delivers it through the real webhook pipeline, and then
redirects to `/t/{slug}/billing?status=success`.

## Webhooks are the only grant path

Entitlements and earnings are created **only** by verified webhooks — never by a
redirect, client call, or optimistic UI.

- Route handlers: `/api/webhooks/lemon-squeezy` and `/api/billing/mock`.
  Both read the **raw request body** and the signature header, then call
  `processBillingWebhook(rawBody, signature)` (`src/lib/billing/webhook.ts`).
- **Signature** is verified with HMAC-SHA256 over the raw body using a
  constant-time compare (`src/lib/billing/signature.ts`). Invalid → **401**, no
  side effects.
- **Idempotency**: every event is keyed by `(provider, provider_event_id)` in
  `billing_webhook_events` with a unique constraint. A replay of an
  already-processed event is a no-op that returns **200**. The provider event id
  is derived deterministically (`event_name:data.id:updated_at`).
- Applying the event is a single call to `apply_billing_event` (the only function
  that grants entitlements or writes earnings), then the webhook row is marked
  `processed`.

### Event → effect mapping

| Event | Effect |
| --- | --- |
| `order_created` | Insert `billing_orders`; grant the product entitlement; for `creator_support`, write a `creator_earnings` row split by the revenue rule. |
| `subscription_created` / `_updated` / `_resumed` | Upsert `billing_subscriptions`; (re)grant the entitlement while status is active/trialing. |
| `subscription_cancelled` / `_expired` | Mark the subscription; entitlement lapses at period end. |
| `subscription_payment_failed` | Mark `past_due`; entitlement follows status. |
| `order_refunded` | Insert `billing_refunds`; write a **compensating (negative) earning**; revoke the entitlement for that source. |
| `unknown` | Stored and acknowledged; no domain effect. |

Every event carries the target tenant; `apply_billing_event` raises
`CROSS_TENANT_EVENT` (`42501`) if a product's tenant differs from the event's
tenant, so a webhook can never write across tenants.

## Creator revenue & earnings

Lemon Squeezy has no split payments, so the platform tracks creator revenue
**internally**:

- **`creator_revenue_rules`** — basis-point splits per creator + product type;
  `creator_share_basis_points + platform_share_basis_points` must equal `10000`
  (checked). The demo seeds an 80/20 rule (8000/2000) — the UI never hard-codes
  the ratio.
- **`creator_earnings`** — an **immutable** ledger. Each paid support order writes
  one row (gross → creator share / platform share) with a unique
  `idempotency_key`. A refund appends a **negative compensating row**; existing
  rows are never mutated or deleted. A creator's balance is always the *sum of the
  active set*, the same reversible-derived pattern used for prediction stats and
  draft standings.

Example: a $5.00 (500¢) support order at 80/20 writes gross 500 → creator 400 /
platform 100. A later refund writes −500 / −400 / −100.

## Payouts (manual in V1)

Creator payouts are **manual**. Earnings are never auto-marked paid.

- A creator requests a payout (`requestPayoutAction`) → a
  `creator_payout_requests` row plus `creator_payout_allocations` reserving the
  currently-available earnings (each earning allocatable **once**, enforced by a
  unique `earning_id`).
- An operator approves (`approve_creator_payout`), then marks it paid
  (`mark_creator_payout_paid`) after sending money out of band, or rejects it
  (`reject_creator_payout`, releasing the reservation). Earnings only count as
  **paid** once a payout is marked paid — request/approval alone never does.
- All three functions require `is_super_admin()` **or** the service role.

The revenue page (`/t/{slug}/creator/revenue`) shows **available / pending /
paid** and the request button.

## Paid Competitor Draft gate

Paid drafts stay **off** unless every condition holds:

1. `PAID_DRAFT_CHECKOUT_ENABLED=true` (default `false` everywhere except
   local/test), **and**
2. an **approved** `provider_product_approvals` row exists for the paid-draft
   product in that tenant.

`startCheckoutAction` refuses a paid-draft checkout otherwise. Free drafts and
free predictions are unaffected — this gate only governs *paid* draft entry.

## Guarantees checklist

- No wallet, stored value, or outcome-linked payout. ✅
- Payments never touch scoring, settlement, draft standings, or sentiment. ✅
- Entitlements/earnings come **only** from signature-verified webhooks. ✅
- Webhook idempotency: same event never processed twice. ✅
- Cross-tenant events rejected. ✅
- Prices/currencies/variant-ids resolved server-side; client values ignored. ✅
- Provider SDK types never cross the `BillingProvider` boundary. ✅
- Immutable earnings ledger; refunds reverse via compensating rows. ✅
- Earnings marked paid only when a payout is marked paid. ✅
- Provider API keys server-only; raw-body signature verification. ✅

## Activating Lemon Squeezy in production

1. Create the store + product variants in Lemon Squeezy (test mode first).
2. Set `BILLING_PROVIDER=lemon_squeezy` and all `LEMON_SQUEEZY_*` vars
   (server-only secrets).
3. Register the webhook endpoint (`/api/webhooks/lemon-squeezy`) with the same
   signing secret as `LEMON_SQUEEZY_WEBHOOK_SECRET`; verify a test event is
   accepted and a replay is a 200 no-op.
4. Seed `billing_products` rows mapping each product type to its LS variant id.
5. For paid drafts only: create an approved `provider_product_approvals` row and
   set `PAID_DRAFT_CHECKOUT_ENABLED=true`.
6. Confirm the full path in test mode: checkout → webhook → entitlement, then a
   refund → reversal, before going live.

## Schema

Migrations `0024`–`0027`:

- `0024_billing_core.sql` — enums + `billing_customers` / `billing_products` /
  `billing_checkouts` / `billing_orders` / `billing_subscriptions` /
  `billing_refunds` / `billing_webhook_events` / `billing_entitlements`.
- `0025_billing_rls.sql` — users read their own rows; products are public read;
  webhook events are super-admin only; all writes go through functions.
- `0026_billing_accounting.sql` — `creator_revenue_rules` /
  `creator_earnings` / `creator_payout_requests` / `creator_payout_allocations` /
  `provider_product_approvals` / `sponsorships` (+ RLS).
- `0027_billing_functions.sql` — `create_billing_checkout`,
  `set_billing_checkout_url`, `apply_billing_event`, and the payout functions,
  plus `app.resolve_revenue_split` / `app.grant_entitlement` /
  `app.revoke_entitlements_for_source`.

## Tests

- `tests/unit/billing.test.ts` — signature signing/verification, event parsing,
  mock provider, status/event mapping.
- `tests/integration/billing.test.ts` — server-priced checkout, premium
  entitlement grant, creator earning split, webhook idempotency, refund reversal,
  cross-tenant rejection, and one-time manual payout.
