/**
 * Custom-domain logic (Phase 8B.8) — pure helpers shared by the middleware,
 * the admin domain UI, and the verification action. No hostname-specific logic
 * lives anywhere else: a request's host maps to a tenant purely through
 * tenant_domains, and everything here is host-agnostic.
 *
 * The verification record prefix is a NEUTRAL fixed token (`_pe-verify`), not the
 * platform's brand — the brand name is configuration (see platform config), never
 * hardcoded.
 */

export type DomainType = "platform" | "custom_subdomain" | "custom_apex";

function stripPort(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h; // IPv6, never a tenant domain
  const colon = h.lastIndexOf(":");
  return colon === -1 ? h : h.slice(0, colon);
}

/**
 * Classify a hostname relative to the platform root domain:
 *   - platform:         a subdomain of the root (tenant.rootdomain)
 *   - custom_subdomain: a customer subdomain (predict.customer.com)
 *   - custom_apex:      a customer root domain (customer.com)
 */
export function classifyDomainType(hostname: string, rootDomain: string): DomainType {
  const host = stripPort(hostname);
  const root = stripPort(rootDomain);
  if (host === root || host.endsWith(`.${root}`)) return "platform";
  // Count labels ignoring a trailing well-known two-label public suffix heuristic:
  // predict.customer.com (3+ labels) → subdomain; customer.com (2 labels) → apex.
  const labels = host.split(".").filter(Boolean);
  return labels.length >= 3 ? "custom_subdomain" : "custom_apex";
}

/** DNS TXT record NAME the tenant must create to prove ownership. */
export function verificationRecordName(hostname: string): string {
  return `_pe-verify.${stripPort(hostname)}`;
}

/** DNS TXT record VALUE (contains the per-domain token). */
export function verificationTxtValue(token: string): string {
  return `pe-verify=${token}`;
}

/** Whether a TXT record set contains the expected verification value. */
export function txtRecordsContainToken(records: readonly string[], token: string): boolean {
  const expected = verificationTxtValue(token);
  return records.some((r) => r.trim() === expected);
}

export type TenantDomainRef = { domain: string; isPrimary: boolean; verified: boolean };

/** The tenant's primary verified hostname, or null. */
export function primaryHostOf(domains: readonly TenantDomainRef[]): string | null {
  return domains.find((d) => d.isPrimary && d.verified)?.domain ?? null;
}

/**
 * If a request arrives on a verified NON-primary custom domain, compute the
 * primary host to redirect to. Returns null when no redirect is needed (the
 * current host is the primary, is unverified, or the tenant has no primary).
 */
export function computeDomainRedirect(
  currentHost: string,
  domains: readonly TenantDomainRef[],
): string | null {
  const host = stripPort(currentHost);
  const primary = primaryHostOf(domains);
  if (!primary || primary === host) return null;
  const current = domains.find((d) => stripPort(d.domain) === host);
  // Only redirect a host we actually own & have verified.
  if (!current || !current.verified) return null;
  return primary;
}

/** Absolute base URL for a hostname (http for localhost, https otherwise). */
export function baseUrlForHost(host: string): string {
  const h = stripPort(host);
  const isLocal = h === "localhost" || h === "127.0.0.1";
  return `${isLocal ? "http" : "https"}://${host}`;
}

/**
 * Sanitize a post-auth return target to a SAME-ORIGIN PATH. Arbitrary/absolute
 * return URLs are never trusted — anything that is not a clean local path becomes
 * "/". This is what binds auth flows to the tenant's own domain.
 */
export function safeReturnPath(input: string | null | undefined): string {
  const value = (input ?? "").trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/"; // protocol-relative
  return value;
}
