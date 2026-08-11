import { config } from "dotenv";

/**
 * Local dev seed scripts target the LOCAL Supabase only. They must NEVER read
 * `.env.local` — since the production launch it can hold PRODUCTION credentials,
 * and seeding demo/test data into production would be catastrophic. Load the
 * test-only env files (most-specific first); dotenv keeps any pre-set shell env.
 */
export function loadLocalEnv() {
  config({ path: ".env.test.local" });
  config({ path: ".env.test" });
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Abort unless the resolved Supabase URL is a loopback host. This rejects the
 * production URL (any `*.supabase.co`) without hard-coding a project ref.
 * Emergency-only bypass — never for production — is `PE_ALLOW_NONLOCAL_TEST_DB=1`.
 */
export function assertLocalDb() {
  if (process.env.PE_ALLOW_NONLOCAL_TEST_DB === "1") return;
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    host = "";
  }
  if (!host || !LOOPBACK.has(host)) {
    console.error(
      `Refusing to seed a non-local Supabase host "${host || "<unset>"}". ` +
        "Seed scripts never read .env.local. Put local keys in .env.test.local " +
        "(see .env.example). Emergency bypass (never for production): PE_ALLOW_NONLOCAL_TEST_DB=1.",
    );
    process.exit(1);
  }
}
