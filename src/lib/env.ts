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
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called in the browser");
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      APP_SIGNING_SECRET: process.env.APP_SIGNING_SECRET,
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
    });
  }
  return cachedServerEnv;
}
