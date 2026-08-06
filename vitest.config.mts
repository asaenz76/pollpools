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
    // Playwright specs live in tests/e2e and are run by Playwright, not Vitest.
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
