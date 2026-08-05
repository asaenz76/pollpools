/**
 * Tenant resolution (spec §5).
 *
 * Pure functions that map an incoming request's host + path to a tenant
 * reference. The result is ALWAYS resolved server-side (middleware) and then
 * verified against the database — the client can never assert a tenant id.
 *
 * Three supported forms:
 *   1. Subdomain:      marbles.predictionengine.example  → { slug: "marbles" }
 *   2. Custom domain:  marblesleague.com                 → { domain: "marblesleague.com" }
 *   3. Dev route:      localhost:3000/t/marbles          → { slug: "marbles" }
 */

import { TENANT_ROUTE_PREFIX } from "@/lib/constants";

export type TenantRef =
  | { kind: "slug"; slug: string; source: "path" | "subdomain" }
  | { kind: "domain"; domain: string; source: "custom" };

/** Hosts that are never tenants themselves. */
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "static", "assets"]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/;

export function isValidTenantSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

function stripPort(host: string): string {
  const trimmed = host.trim().toLowerCase();
  // IPv6 hosts are bracketed; leave them intact (never a tenant).
  if (trimmed.startsWith("[")) return trimmed;
  const colon = trimmed.lastIndexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

/** Extract a `/t/{slug}` prefix from a pathname, if present. */
export function parseTenantPath(pathname: string): string | null {
  const prefix = `${TENANT_ROUTE_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slug = rest.split("/", 1)[0] ?? "";
  return isValidTenantSlug(slug) ? slug : null;
}

/**
 * Resolve a tenant reference from request coordinates. Returns null when the
 * request targets the platform apex/root with no tenant path (e.g. the marketing
 * or platform-admin surface).
 */
export function resolveTenantRef(input: {
  host: string | null;
  pathname: string;
  rootDomain: string;
}): TenantRef | null {
  const { host, pathname, rootDomain } = input;

  // 1. Dev/path routing wins so it works on bare localhost without DNS.
  const pathSlug = parseTenantPath(pathname);
  if (pathSlug) return { kind: "slug", slug: pathSlug, source: "path" };

  if (!host) return null;

  const cleanHost = stripPort(host);
  const cleanRoot = stripPort(rootDomain);

  // Apex root or plain localhost with no tenant path → platform surface.
  if (cleanHost === cleanRoot || cleanHost === "localhost" || cleanHost === "127.0.0.1") {
    return null;
  }

  // 2. Subdomain of the configured root domain.
  if (cleanHost.endsWith(`.${cleanRoot}`)) {
    const sub = cleanHost.slice(0, -(cleanRoot.length + 1));
    // Only a single left-most label is treated as the tenant slug.
    const label = sub.split(".").pop() ?? sub;
    if (!RESERVED_SUBDOMAINS.has(label) && isValidTenantSlug(label)) {
      return { kind: "slug", slug: label, source: "subdomain" };
    }
    return null;
  }

  // 3. Anything else with a dot is treated as a custom domain (DB lookup).
  if (cleanHost.includes(".")) {
    return { kind: "domain", domain: cleanHost, source: "custom" };
  }

  return null;
}
