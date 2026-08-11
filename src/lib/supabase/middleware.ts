import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { resolveTenantRef } from "@/lib/tenant/resolver";
import { classifyHost, tenantRewriteTarget, stripTenantPrefix } from "@/lib/tenant/host";
import { computeDomainRedirect } from "@/lib/domain/domains";

/** Header names used to pass the middleware-resolved tenant to server components. */
export const TENANT_HEADER = {
  kind: "x-pe-tenant-kind",
  value: "x-pe-tenant-value",
  source: "x-pe-tenant-source",
} as const;

/**
 * Refresh the Supabase auth session (rotates cookies) AND resolve the tenant
 * server-side from host/path, stamping it into forwarded request headers. The
 * client can never assert a tenant — it is derived here from the trusted host.
 */
export async function updateSessionAndTenant(request: NextRequest) {
  // Resolve tenant from the trusted request coordinates.
  const ref = resolveTenantRef({
    host: request.headers.get("host"),
    pathname: request.nextUrl.pathname,
    rootDomain: publicEnv.NEXT_PUBLIC_ROOT_DOMAIN,
  });

  const requestHeaders = new Headers(request.headers);
  // Clear any client-supplied tenant headers to prevent spoofing.
  requestHeaders.delete(TENANT_HEADER.kind);
  requestHeaders.delete(TENANT_HEADER.value);
  requestHeaders.delete(TENANT_HEADER.source);
  if (ref) {
    requestHeaders.set(TENANT_HEADER.kind, ref.kind);
    requestHeaders.set(TENANT_HEADER.value, ref.kind === "slug" ? ref.slug : ref.domain);
    requestHeaders.set(TENANT_HEADER.source, ref.source);
  }

  // Capture cookies the session refresh wants to set, so the final response — be
  // it next(), a rewrite, or a redirect — carries them.
  const pendingCookies: { name: string; value: string; options?: Record<string, unknown> }[] = [];
  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  // Touch the user to trigger a token refresh when needed. Do not add logic
  // between client creation and this call (per Supabase SSR guidance).
  await supabase.auth.getUser();

  const applyCookies = (res: NextResponse): NextResponse => {
    for (const { name, value, options } of pendingCookies) res.cookies.set(name, value, options);
    return res;
  };
  const nextResponse = () => applyCookies(NextResponse.next({ request: { headers: requestHeaders } }));

  // ── Host-based tenant routing (PL.1) ──────────────────────────────────────
  // On a tenant host (verified custom domain or platform subdomain) the browser
  // URL stays clean while the request is served by the `/t/{slug}` route tree
  // internally. Platform hosts and unknown/unverified hosts are never rewritten.
  const host = request.headers.get("host");
  const hostClass = classifyHost(host, publicEnv.NEXT_PUBLIC_ROOT_DOMAIN);
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search;

  if (hostClass.kind === "custom") {
    // Authoritative: the domain must be a VERIFIED row mapping to an ACTIVE tenant.
    const { data: owner } = await supabase
      .from("tenant_domains")
      .select("tenant_id, tenants!inner(slug, status)")
      .eq("domain", hostClass.domain)
      .eq("verified", true)
      .maybeSingle();
    const tenant = owner?.tenants as { slug: string; status: string } | { slug: string; status: string }[] | undefined;
    const t = Array.isArray(tenant) ? tenant[0] : tenant;
    if (owner && t && t.status === "active") {
      // White-label: a verified NON-primary domain redirects to the primary host.
      const { data: domains } = await supabase
        .from("tenant_domains")
        .select("domain, is_primary, verified")
        .eq("tenant_id", owner.tenant_id)
        .eq("verified", true);
      const redirectHost = computeDomainRedirect(
        host ?? "",
        (domains ?? []).map((d) => ({ domain: d.domain, isPrimary: d.is_primary, verified: d.verified })),
      );
      if (redirectHost) {
        return applyCookies(NextResponse.redirect(new URL(pathname + search, `https://${redirectHost}`), 308));
      }
      // Keep the internal /t/{slug} prefix out of the browser URL.
      const stripped = stripTenantPrefix(t.slug, pathname);
      if (stripped) return applyCookies(NextResponse.redirect(new URL(stripped + search, request.url), 308));
      const target = tenantRewriteTarget(t.slug, pathname);
      if (target) {
        return applyCookies(NextResponse.rewrite(new URL(target + search, request.url), { request: { headers: requestHeaders } }));
      }
    }
    // Unknown/unverified/inactive custom domain → fall through (no tenant served).
  } else if (hostClass.kind === "subdomain") {
    const stripped = stripTenantPrefix(hostClass.slug, pathname);
    if (stripped) return applyCookies(NextResponse.redirect(new URL(stripped + search, request.url), 308));
    const target = tenantRewriteTarget(hostClass.slug, pathname);
    if (target) {
      return applyCookies(NextResponse.rewrite(new URL(target + search, request.url), { request: { headers: requestHeaders } }));
    }
  }

  return nextResponse();
}
