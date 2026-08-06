// Test stub for the `server-only` guard package. In production this module throws
// if imported into a client bundle; under Vitest (node/jsdom) there is no such
// boundary, so we alias it to this no-op so server modules can be unit/integration
// tested. See vitest.config.mts `resolve.alias`.
export {};
