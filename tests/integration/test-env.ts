import { config } from "dotenv";

/**
 * Test environment loader + production-target safety guard.
 *
 * Tests must NEVER read `.env.local`. Since the production launch, `.env.local`
 * can hold PRODUCTION Supabase credentials, so a stray `npm test` that loaded it
 * would read/write the production database. Instead we load test-only env files,
 * most-specific first. `dotenv` does not override an already-set `process.env`
 * value, so precedence is: real shell/CI env  >  `.env.test.local` (gitignored,
 * real local keys)  >  `.env.test` (committed, safe local defaults).
 */
config({ path: ".env.test.local" });
config({ path: ".env.test" });

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Production-target safety check. Under the test runner the Supabase URL must
 * resolve to a loopback host; any non-local host (e.g. a `*.supabase.co`
 * production project) aborts the run immediately rather than touching a remote
 * database. This rejects the production URL without hard-coding any project ref.
 *
 * Emergency-only bypass — never for production — is `PE_ALLOW_NONLOCAL_TEST_DB=1`.
 * If no URL is set at all, this is a no-op: `integrationEnvReady` is then false
 * and the suites skip under the existing CI policy (`_env-guard.test.ts`).
 */
function assertLocalTestDb(): void {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return;
  if (process.env.PE_ALLOW_NONLOCAL_TEST_DB === "1") return;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return;
  }
  if (!LOOPBACK.has(host)) {
    throw new Error(
      `Refusing to run tests against a non-local Supabase host "${host}". ` +
        "Tests never read .env.local (it may hold production credentials). " +
        "Put local Supabase keys in .env.test.local (see .env.example / docs/environment.md). " +
        "Emergency bypass (never for production): PE_ALLOW_NONLOCAL_TEST_DB=1.",
    );
  }
}

assertLocalTestDb();
