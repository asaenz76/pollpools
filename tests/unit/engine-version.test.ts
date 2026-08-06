import { describe, it, expect } from "vitest";
import {
  CURRENT_ENGINE_VERSION,
  SUPPORTED_ENGINE_VERSIONS,
  isSupportedEngineVersion,
  resolveEngineVersion,
} from "@/lib/engine/version";

describe("engine versioning", () => {
  it("declares a current version that is supported", () => {
    expect(isSupportedEngineVersion(CURRENT_ENGINE_VERSION)).toBe(true);
    expect(SUPPORTED_ENGINE_VERSIONS).toContain(CURRENT_ENGINE_VERSION);
  });

  it("never resolves to a literal 'latest'", () => {
    expect(resolveEngineVersion("latest")).not.toBe("latest");
    expect(resolveEngineVersion("latest")).toBe(CURRENT_ENGINE_VERSION);
  });

  it("resolves a supported stored version to itself, and unknown/absent to current", () => {
    expect(resolveEngineVersion("1.0")).toBe("1.0");
    expect(resolveEngineVersion("9.9")).toBe(CURRENT_ENGINE_VERSION);
    expect(resolveEngineVersion(null)).toBe(CURRENT_ENGINE_VERSION);
    expect(resolveEngineVersion(undefined)).toBe(CURRENT_ENGINE_VERSION);
  });
});
