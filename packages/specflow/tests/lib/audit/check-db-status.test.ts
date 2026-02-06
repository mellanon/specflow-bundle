import { describe, it, expect } from "bun:test";
import { checkDbStatus } from "../../../src/lib/audit/check-db-status";
import type { Feature } from "../../../src/types";

function makeFeature(overrides: Partial<Feature>): Feature {
  return {
    id: "F-1",
    name: "Test Feature",
    description: "desc",
    priority: 1,
    status: "pending",
    phase: "none",
    specPath: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    migratedFrom: null,
    quickStart: false,
    ...overrides,
  };
}

describe("checkDbStatus", () => {
  it("should return empty array for pending features", () => {
    const features = [makeFeature({ id: "F-1", status: "pending" })];
    const findings = checkDbStatus(features);
    expect(findings).toEqual([]);
  });

  it("should flag CRITICAL when complete feature has no specPath", () => {
    const features = [makeFeature({ id: "F-1", status: "complete", specPath: null })];
    const findings = checkDbStatus(features);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].check).toBe("db-status");
    expect(findings[0].featureId).toBe("F-1");
    expect(findings[0].message).toContain("Status=complete");
  });

  it("should flag CRITICAL when complete feature specPath does not exist", () => {
    const features = [
      makeFeature({
        id: "F-1",
        status: "complete",
        specPath: "/nonexistent/path/to/spec",
      }),
    ];
    const findings = checkDbStatus(features);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].suggestedFix).toContain("specflow skip F-1");
  });

  it("should return INFO for skipped features with reason", () => {
    const features = [
      makeFeature({ id: "F-7", status: "skipped", skipReason: "superseded" }),
    ];
    const findings = checkDbStatus(features);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("superseded");
  });

  it("should return INFO for skipped features without reason", () => {
    const features = [makeFeature({ id: "F-7", status: "skipped" })];
    const findings = checkDbStatus(features);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("no reason given");
  });

  it("should flag evolving features with missing specPath", () => {
    const features = [
      makeFeature({ id: "F-17", status: "evolving", specPath: null }),
    ];
    const findings = checkDbStatus(features);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].message).toContain("Status=evolving");
  });

  it("should not flag complete features with existing specPath", () => {
    // Use a directory that exists on the system
    const features = [
      makeFeature({ id: "F-1", status: "complete", specPath: "/tmp" }),
    ];
    const findings = checkDbStatus(features);
    expect(findings).toEqual([]);
  });
});
