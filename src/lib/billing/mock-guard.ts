/**
 * Mock billing surfaces (self-signed webhooks, mock hosted-checkout) must NEVER be
 * reachable in production, regardless of BILLING_PROVIDER. A production deployment
 * misconfigured to `BILLING_PROVIDER=mock` would otherwise expose routes that grant
 * entitlements without real payment (Architecture Review v2 — F-24 hardening). This
 * is a hard NODE_ENV guard, independent of the provider setting.
 */
export function mockBillingUnavailable(): boolean {
  return process.env.NODE_ENV === "production";
}
