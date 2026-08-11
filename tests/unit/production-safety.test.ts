// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// env.ts validates NEXT_PUBLIC_* at import; supply the two required ones (only if
// absent) and import dynamically, so this test never depends on a global env load
// (which would leak CRON_SECRET etc. into tests that assert their absence).
let productionEnvIssues: (typeof import("@/lib/env"))["productionEnvIssues"];
beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder-anon";
  ({ productionEnvIssues } = await import("@/lib/env"));
});

/** A minimally valid production env (no dangerous config). */
const PROD_OK: Record<string, string | undefined> = {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_APP_URL: "https://pollpools.com",
  NEXT_PUBLIC_ROOT_DOMAIN: "pollpools.com",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  APP_SIGNING_SECRET: "sign",
  CRON_SECRET: "cron",
  BILLING_PROVIDER: "manual",
};

describe("productionEnvIssues", () => {
  it("passes a minimally valid production env (email is only a warning)", () => {
    const { errors, warnings } = productionEnvIssues(PROD_OK);
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("email"))).toBe(true);
  });
  it("errors on missing required config and missing CRON_SECRET in production", () => {
    const { errors } = productionEnvIssues({ NODE_ENV: "production" });
    expect(errors.some((e) => e.includes("SUPABASE_SERVICE_ROLE_KEY"))).toBe(true);
    expect(errors.some((e) => e.includes("CRON_SECRET"))).toBe(true);
  });
  it("errors on mock billing in production", () => {
    const { errors } = productionEnvIssues({ ...PROD_OK, BILLING_PROVIDER: "mock" });
    expect(errors.some((e) => e.includes("mock"))).toBe(true);
  });
  it("errors when live Lemon Squeezy lacks its webhook secret", () => {
    const { errors } = productionEnvIssues({ ...PROD_OK, BILLING_PROVIDER: "lemon_squeezy", LEMON_SQUEEZY_TEST_MODE: "false", LEMON_SQUEEZY_API_KEY: "k", LEMON_SQUEEZY_STORE_ID: "s" });
    expect(errors.some((e) => e.includes("LEMON_SQUEEZY_WEBHOOK_SECRET"))).toBe(true);
  });
  it("errors if a server secret is exposed through a NEXT_PUBLIC_ var", () => {
    const { errors } = productionEnvIssues({ ...PROD_OK, NEXT_PUBLIC_SERVICE_ROLE_KEY: "leak" });
    expect(errors.some((e) => e.includes("exposed"))).toBe(true);
  });
  it("does not error merely because optional email/media providers are absent", () => {
    const { errors } = productionEnvIssues(PROD_OK);
    expect(errors).toEqual([]);
  });
});

describe("production bootstrap has no demo/test identities (§46)", () => {
  const FORBIDDEN = ["@pollpools.test", "@marblegp.test", "Password123!"];
  const migrationsDir = join(process.cwd(), "supabase", "migrations");

  it("no migration file contains a known test identity or password", () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThan(50);
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(join(migrationsDir, f), "utf8");
      for (const needle of FORBIDDEN) if (content.includes(needle)) offenders.push(`${f}: ${needle}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the build/start scripts never invoke a demo/seed script", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const key of ["build", "start"]) {
      const script = pkg.scripts[key] ?? "";
      expect(script).not.toMatch(/seed/i);
    }
  });
});

describe("public copy avoids gambling/betting framing (§21)", () => {
  const files = [
    "src/app/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/privacy/page.tsx",
    "src/app/support/page.tsx",
    "src/components/legal/legal-page.tsx",
  ];
  // "not a betting service" negations are allowed; bare marketing terms are not.
  const BANNED = /\b(sportsbook|wagering|gambling)\b/i;

  it("no public/legal page markets the product with gambling terms", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(join(process.cwd(), f), "utf8");
      // Allow the explicit "not a betting/wagering/gaming service" disclaimer lines.
      const marketing = content.replace(/not a betting[^.]*\./gi, "").replace(/never (a wager|involve)[^.]*\./gi, "");
      if (BANNED.test(marketing)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
