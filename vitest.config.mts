import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws when imported outside a server bundle; in tests there
      // is no client/server boundary, so alias it to a no-op to allow importing
      // server modules (admin client, internal routes) directly.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Integration tests drive a live DB with many sequential round-trips and job
    // draining, all against one shared database under file-parallel execution;
    // give them headroom so contention doesn't trip the default 5s timeout.
    testTimeout: 20_000,
    // Integration fixtures (beforeAll/afterAll) create users + seed rows over many
    // DB round-trips; under file-parallel load against one shared DB the default
    // 10s hook budget can be exceeded, so give hooks the same headroom as tests.
    hookTimeout: 20_000,
    // All integration suites share ONE local Postgres; too many parallel files
    // overload it and make timing-sensitive suites (fan-out eligibility) flake.
    // Cap worker threads to keep DB contention bounded and runs deterministic.
    poolOptions: { threads: { maxThreads: 4, minThreads: 1 } },
    // Playwright specs live in tests/e2e and are run by Playwright, not Vitest.
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
