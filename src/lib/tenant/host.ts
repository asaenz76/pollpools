/**
 * Centralized host classification + tenant path rewriting (PL.1).
 *
 * The application's routes physically live under `/t/[tenantSlug]/…`. On a custom
 * tenant domain (or a tenant subdomain) the browser URL must stay clean
 * (`marblegrandprix.com/events`) while the request is served by the tenant route
 * tree internally (`/t/marbles/events`). These pure helpers decide *what* to do;
 * the middleware performs the rewrite/redirect and remains the only place that
 * touches `tenant_domains` (the authoritative ownership model — never duplicated).
 *
 * No tenant-specific branching: everything is derived from host shape +
 * `tenant_domains`, so `predictions.exampleclub.com` works exactly like
 * `marblegrandprix.com`.
 */

const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "static", "assets"]);
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/;

/** Paths that are never tenant-scoped, even on a tenant host (platform + legal). */
const NON_TENANT_PREFIXES = ["/api", "/_next", "/admin", "/t", "/terms", "/privacy", "/support"];

export type HostClass =
  | { kind: "platform" }
  | { kind: "subdomain"; slug: string }
  | { kind: "custom"; domain: string }
  | { kind: "unknown" };

function stripPort(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) return trimmed; // IPv6 — never a tenant
  const colon = trimmed.lastIndexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
}

/**
 * Classify a host by SHAPE alone (independent of path). `custom` still requires a
 * verified `tenant_domains` row to actually resolve — classification only says
 * "this looks like a custom domain"; the DB is authoritative for whether it maps
 * to a tenant.
 */
export function classifyHost(host: string | null, rootDomain: string): HostClass {
  if (!host) return { kind: "platform" };
  const cleanHost = stripPort(host);
  const cleanRoot = stripPort(rootDomain);

  // Platform apex, its www, and dev hosts serve Poll Pools itself.
  if (
    cleanHost === cleanRoot ||
    cleanHost === `www.${cleanRoot}` ||
    cleanHost === "localhost" ||
    cleanHost === "127.0.0.1"
  ) {
    return { kind: "platform" };
  }

  // Subdomain of the configured platform root (excluding reserved labels).
  if (cleanRoot && cleanHost.endsWith(`.${cleanRoot}`)) {
    const sub = cleanHost.slice(0, -(cleanRoot.length + 1));
    const label = sub.split(".").pop() ?? sub;
    if (!RESERVED_SUBDOMAINS.has(label) && SLUG_PATTERN.test(label)) {
      return { kind: "subdomain", slug: label };
    }
    return { kind: "platform" }; // reserved subdomain (www/app/…) is platform
  }

  // Any other dotted host is a candidate custom domain (verified via the DB).
  if (cleanHost.includes(".")) return { kind: "custom", domain: cleanHost };

  // Bare single-label host that isn't the root/localhost → unknown; fail safe.
  return { kind: "unknown" };
}

/**
 * Internal rewrite target for a tenant host serving `pathname`, or null when the
 * path must NOT be rewritten (already tenant-prefixed, a platform/API/admin path,
 * or a static file). `/` maps to the tenant home.
 */
export function tenantRewriteTarget(slug: string, pathname: string): string | null {
  for (const p of NON_TENANT_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return null;
  }
  const last = pathname.split("/").pop() ?? "";
  if (last.includes(".")) return null; // static-ish (favicon.ico, robots.txt, …)
  return pathname === "/" ? `/t/${slug}` : `/t/${slug}${pathname}`;
}

/**
 * If `pathname` carries the tenant's OWN `/t/{slug}` prefix, return the clean
 * (prefix-free) path so the middleware can redirect to it on the tenant host —
 * keeping the internal prefix out of the browser URL. Null when there is nothing
 * to strip.
 */
export function stripTenantPrefix(slug: string, pathname: string): string | null {
  const base = `/t/${slug}`;
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length) || "/";
  return null;
}
