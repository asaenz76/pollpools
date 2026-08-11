import { config } from "dotenv";
// Load local env before any test module imports `@/lib/env` (which validates
// NEXT_PUBLIC_* at import time). Integration suites also load this in their helpers;
// loading here first makes env-importing unit tests reliable in isolation too.
config({ path: ".env.local" });

import "@testing-library/jest-dom/vitest";
