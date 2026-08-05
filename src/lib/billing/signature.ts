import { createHmac, timingSafeEqual } from "node:crypto";

// node:crypto is server/runtime only; importing this in a client bundle fails to
// build, which is the intended guard. Kept free of `server-only` so the pure
// signature helpers remain unit-testable in the node test environment.

/** HMAC-SHA256 hex digest of a raw body (spec §16 webhook verification). */
export function hmacSha256Hex(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Constant-time comparison of two hex strings. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
