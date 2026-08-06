import { timingSafeEqual } from "node:crypto";

/**
 * Authorization for internal scheduled endpoints (job drain, projection monitor).
 *
 * The secret is server-only and is compared in constant time. Vercel Cron (and
 * any external scheduler) authenticates by sending `Authorization: Bearer
 * <CRON_SECRET>`; `x-cron-secret` is accepted as an alternative header. If no
 * secret is configured the endpoint refuses to run (503) — it is never open.
 */
export type CronAuth = { ok: true } | { ok: false; status: 401 | 503; message: string };

function currentSecret(): string | undefined {
  // Read straight from the environment (server-only). Kept off the validated
  // `serverEnv()` object so importing this guard never forces the full env parse
  // (e.g. in unit tests). An empty value is treated as "not configured".
  const s = process.env.CRON_SECRET;
  return s && s.length > 0 ? s : undefined;
}

/** `secret` is injectable so the auth logic is unit-testable without env caching. */
export function authorizeCron(request: Request, secret: string | undefined = currentSecret()): CronAuth {
  if (!secret) return { ok: false, status: 503, message: "CRON_SECRET is not configured" };
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const provided = bearer || request.headers.get("x-cron-secret") || "";
  if (!provided || !safeEqual(provided, secret)) return { ok: false, status: 401, message: "Unauthorized" };
  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
