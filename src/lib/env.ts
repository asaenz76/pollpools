import { z } from "zod";

/**
 * Validated environment access.
 *
 * `publicEnv` holds only NEXT_PUBLIC_* values safe for the browser bundle.
 * `serverEnv()` is a function (not a top-level constant) so that merely importing
 * a module doesn't force server-only secrets to exist at build time on the client.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_ROOT_DOMAIN: z.string().min(1).default("localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_SIGNING_SECRET: z.string().min(1),

  // Shared secret authenticating internal scheduled endpoints (job drain,
  // projection monitor). Optional so local/dev builds don't require it, but the
  // endpoints refuse to run (503) until it is set — they are never open.
  CRON_SECRET: z.string().min(1).optional(),
  // Allow integration tests to skip when the DB env is absent. Defaults false so
  // CI cannot silently skip; a local developer may set it true (see §11 / docs).
  ALLOW_INTEGRATION_TEST_SKIP: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),

  // ── Billing (Phase 7) ──────────────────────────────────────────────────────
  BILLING_PROVIDER: z.enum(["lemon_squeezy", "mock", "manual"]).default("mock"),
  // Production gate: paid Competitor Draft checkout stays OFF unless explicitly on.
  PAID_DRAFT_CHECKOUT_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  // Mock/webhook secret used by the mock provider + internal signing.
  BILLING_WEBHOOK_SECRET: z.string().min(1).default("local-billing-webhook-secret-change-me"),
  LEMON_SQUEEZY_API_KEY: z.string().optional(),
  LEMON_SQUEEZY_STORE_ID: z.string().optional(),
  LEMON_SQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  LEMON_SQUEEZY_TEST_MODE: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID: z.string().optional(),
  LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID: z.string().optional(),
  LEMON_SQUEEZY_PAID_DRAFT_VARIANT_ID: z.string().optional(),

  // ── Application email (PL.3, optional) ─────────────────────────────────────
  // Resend is the preferred transport; the generic EMAIL_API_* path is a fallback.
  // All OPTIONAL — with none set, notification email delivery skips (never faked).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_API_ENDPOINT: z.string().optional(),
  EMAIL_API_KEY: z.string().optional(),
});

/** Env var launch classification (documented in docs/environment.md). */
export type EnvClass = "REQUIRED_PRODUCTION" | "OPTIONAL_PRODUCTION" | "DEVELOPMENT_ONLY" | "TEST_ONLY";
export const ENV_CLASSIFICATION: Record<string, EnvClass> = {
  NEXT_PUBLIC_SUPABASE_URL: "REQUIRED_PRODUCTION",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "REQUIRED_PRODUCTION",
  NEXT_PUBLIC_APP_URL: "REQUIRED_PRODUCTION",
  NEXT_PUBLIC_ROOT_DOMAIN: "REQUIRED_PRODUCTION",
  SUPABASE_SERVICE_ROLE_KEY: "REQUIRED_PRODUCTION",
  APP_SIGNING_SECRET: "REQUIRED_PRODUCTION",
  CRON_SECRET: "REQUIRED_PRODUCTION",
  BILLING_PROVIDER: "REQUIRED_PRODUCTION",
  BILLING_WEBHOOK_SECRET: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_API_KEY: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_STORE_ID: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_WEBHOOK_SECRET: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_TEST_MODE: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID: "OPTIONAL_PRODUCTION",
  LEMON_SQUEEZY_PAID_DRAFT_VARIANT_ID: "OPTIONAL_PRODUCTION",
  PAID_DRAFT_CHECKOUT_ENABLED: "OPTIONAL_PRODUCTION",
  RESEND_API_KEY: "OPTIONAL_PRODUCTION",
  EMAIL_FROM: "OPTIONAL_PRODUCTION",
  EMAIL_API_ENDPOINT: "OPTIONAL_PRODUCTION",
  EMAIL_API_KEY: "OPTIONAL_PRODUCTION",
  ALLOW_INTEGRATION_TEST_SKIP: "TEST_ONLY",
};

/**
 * Fail-loud readiness classifier (PL.5 §31/§32). Returns dangerous/missing config
 * as `errors` and advisory issues as `warnings`. Optional providers (email, custom
 * domains, external media) never become errors merely because support exists.
 * Pure — takes an env snapshot so it is testable and callable from a readiness route.
 */
export function productionEnvIssues(env: Record<string, string | undefined> = process.env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === "production";

  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_ROOT_DOMAIN", "SUPABASE_SERVICE_ROLE_KEY", "APP_SIGNING_SECRET"]) {
    if (!env[k]) errors.push(`Missing required server/public config: ${k}`);
  }
  if (isProd && !env.CRON_SECRET) errors.push("CRON_SECRET is required in production (internal cron/job endpoints stay disabled without it).");

  const provider = env.BILLING_PROVIDER ?? "mock";
  if (isProd && provider === "mock") errors.push("BILLING_PROVIDER=mock must not be used in production (use 'manual' or 'lemon_squeezy').");
  if (provider === "lemon_squeezy") {
    const live = env.LEMON_SQUEEZY_TEST_MODE === "false";
    if (live) {
      for (const k of ["LEMON_SQUEEZY_API_KEY", "LEMON_SQUEEZY_STORE_ID", "LEMON_SQUEEZY_WEBHOOK_SECRET"]) {
        if (!env[k]) errors.push(`Live Lemon Squeezy billing requires ${k}.`);
      }
    } else if (isProd) {
      warnings.push("Lemon Squeezy is in TEST mode in production (set LEMON_SQUEEZY_TEST_MODE=false to go live).");
    }
  }

  const emailConfigured = Boolean((env.RESEND_API_KEY && env.EMAIL_FROM) || (env.EMAIL_API_ENDPOINT && env.EMAIL_API_KEY && env.EMAIL_FROM));
  if (isProd && !emailConfigured) warnings.push("Application email transport not configured (RESEND_API_KEY + EMAIL_FROM) — notification emails will skip safely.");

  // Secret hygiene: a server secret must never be exposed through NEXT_PUBLIC_*.
  for (const k of Object.keys(env)) {
    if (k.startsWith("NEXT_PUBLIC_") && /(SERVICE_ROLE|_SECRET|API_KEY|PRIVATE_KEY)/i.test(k)) {
      errors.push(`Server secret exposed via public var: ${k}`);
    }
  }
  return { errors, warnings };
}

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called in the browser");
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      APP_SIGNING_SECRET: process.env.APP_SIGNING_SECRET,
      CRON_SECRET: process.env.CRON_SECRET,
      ALLOW_INTEGRATION_TEST_SKIP: process.env.ALLOW_INTEGRATION_TEST_SKIP,
      BILLING_PROVIDER: process.env.BILLING_PROVIDER,
      PAID_DRAFT_CHECKOUT_ENABLED: process.env.PAID_DRAFT_CHECKOUT_ENABLED,
      BILLING_WEBHOOK_SECRET: process.env.BILLING_WEBHOOK_SECRET,
      LEMON_SQUEEZY_API_KEY: process.env.LEMON_SQUEEZY_API_KEY,
      LEMON_SQUEEZY_STORE_ID: process.env.LEMON_SQUEEZY_STORE_ID,
      LEMON_SQUEEZY_WEBHOOK_SECRET: process.env.LEMON_SQUEEZY_WEBHOOK_SECRET,
      LEMON_SQUEEZY_TEST_MODE: process.env.LEMON_SQUEEZY_TEST_MODE,
      LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID: process.env.LEMON_SQUEEZY_PLATFORM_PREMIUM_VARIANT_ID,
      LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID: process.env.LEMON_SQUEEZY_CREATOR_SUPPORT_VARIANT_ID,
      LEMON_SQUEEZY_PAID_DRAFT_VARIANT_ID: process.env.LEMON_SQUEEZY_PAID_DRAFT_VARIANT_ID,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      EMAIL_API_ENDPOINT: process.env.EMAIL_API_ENDPOINT,
      EMAIL_API_KEY: process.env.EMAIL_API_KEY,
    });
  }
  return cachedServerEnv;
}
