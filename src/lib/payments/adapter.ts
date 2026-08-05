/**
 * Provider-agnostic payment adapter (spec §3). V1 ships a MOCK/test adapter only
 * — no real provider is hard-coded. A real provider (Stripe, Lemon Squeezy, …)
 * would implement this same interface behind an explicit project decision.
 *
 * The draft PAID flow never touches prediction or draft scoring; payment only
 * unlocks the draft assignment.
 */

export type PaymentIntent = {
  provider: string;
  reference: string;
  amountMinorUnits: number;
  currencyCode: string;
  /** Where the client is sent / what it needs to complete payment. */
  clientData: Record<string, unknown>;
};

export type PaymentWebhook = {
  provider: string;
  reference: string;
  status: "paid" | "failed";
  signature: string;
};

export interface PaymentAdapter {
  readonly provider: string;
  /** Verify a webhook's authenticity (signature). */
  verifyWebhook(payload: PaymentWebhook, secret: string): boolean;
}

/**
 * Mock adapter. A "payment" is confirmed by posting a signed webhook to the
 * internal endpoint; the signature is an HMAC-style token over the reference so
 * replay/forgery is still exercised end to end.
 */
export class MockPaymentAdapter implements PaymentAdapter {
  readonly provider = "mock";

  /** Deterministic, non-cryptographic signature for the test adapter. */
  static sign(reference: string, secret: string): string {
    let hash = 2166136261;
    const input = `${secret}:${reference}`;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `mock_sig_${(hash >>> 0).toString(16)}`;
  }

  verifyWebhook(payload: PaymentWebhook, secret: string): boolean {
    if (payload.provider !== this.provider) return false;
    return payload.signature === MockPaymentAdapter.sign(payload.reference, secret);
  }
}

/** Resolve the configured adapter. Only the mock is available in V1. */
export function getPaymentAdapter(provider: string = "mock"): PaymentAdapter {
  if (provider === "mock") return new MockPaymentAdapter();
  throw new Error(`Unsupported payment provider: ${provider}. Only "mock" is implemented in V1.`);
}
