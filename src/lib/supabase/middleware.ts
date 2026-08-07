import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import { resolveTenantRef } from "@/lib/tenant/resolver";
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

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the user to trigger a token refresh when needed. Do not add logic
  // between client creation and this call (per Supabase SSR guidance).
  await supabase.auth.getUser();

  // White-label: a request on a verified NON-primary custom domain redirects to
  // the tenant's primary domain. Only runs for custom-domain hosts (never for the
  // platform root, subdomains, or /t/ path routing), so there is no per-request
  // cost on the common path. Verified rows are publicly readable (RLS).
  if (ref?.kind === "domain") {
    const host = request.headers.get("host") ?? "";
    const { data: owner } = await supabase
      .from("tenant_domains")
      .select("tenant_id")
      .eq("domain", ref.domain)
      .eq("verified", true)
      .maybeSingle();
    if (owner) {
      const { data: domains } = await supabase
        .from("tenant_domains")
        .select("domain, is_primary, verified")
        .eq("tenant_id", owner.tenant_id)
        .eq("verified", true);
      const redirectHost = computeDomainRedirect(
        host,
        (domains ?? []).map((d) => ({ domain: d.domain, isPrimary: d.is_primary, verified: d.verified })),
      );
      if (redirectHost) {
        const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${redirectHost}`);
        return NextResponse.redirect(target, 308);
      }
    }
  }

  return response;
}
