import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * CSP notes:
 * - `frame-src` allows YouTube because the `youtube_embeds_enabled` feature flag
 *   renders privacy-enhanced (youtube-nocookie.com) iframes.
 * - `connect-src` allows Supabase over https/wss for realtime + REST.
 * - `img-src` allows https + data/blob for avatars, covers, and YouTube thumbnails.
 * We intentionally avoid `unsafe-eval`. `unsafe-inline` for styles is required by
 * Tailwind's runtime style injection.
 */
const isDev = process.env.NODE_ENV !== "production";

// React's development build uses eval() for debugging features; it never does in
// production. We allow 'unsafe-eval' ONLY in dev so the production CSP stays strict.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

// Dev HMR uses ws://localhost; production locks connections to https/wss.
const connectSrc = isDev
  ? "connect-src 'self' https: wss: ws:"
  : "connect-src 'self' https: wss:";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
  connectSrc,
  "worker-src 'self' blob:",
  // Upgrading breaks ws://localhost HMR in dev; only enforce it in production.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
