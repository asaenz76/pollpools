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
  SUBSCRIPTION_PROVIDER: z.string().default("mock"),
  SUBSCRIPTION_WEBHOOK_SECRET: z.string().min(1),
  APP_SIGNING_SECRET: z.string().min(1),
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called in the browser");
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUBSCRIPTION_PROVIDER: process.env.SUBSCRIPTION_PROVIDER,
      SUBSCRIPTION_WEBHOOK_SECRET: process.env.SUBSCRIPTION_WEBHOOK_SECRET,
      APP_SIGNING_SECRET: process.env.APP_SIGNING_SECRET,
    });
  }
  return cachedServerEnv;
}
