import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  normalizeFeatureId,
  checkJsonSync,
} from "../../../src/lib/audit/check-json-sync";
import type { Feature } from "../../../src/types";

const TEST_DIR = "/tmp/specflow-audit-json-sync-test";

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

describe("normalizeFeatureId", () => {
  it("should strip leading zeros", () => {
    expect(normalizeFeatureId("F-001")).toBe("F-1");
    expect(normalizeFeatureId("F-025")).toBe("F-25");
    expect(normalizeFeatureId("F-100")).toBe("F-100");
  });

  it("should handle already normalized IDs", () => {
    expect(normalizeFeatureId("F-1")).toBe("F-1");
    expect(normalizeFeatureId("F-25")).toBe("F-25");
  });

  it("should handle case insensitivity", () => {
    expect(normalizeFeatureId("f-001")).toBe("F-1");
  });
});

describe("checkJsonSync", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("should return empty when no features.json exists", () => {
    const features = [makeFeature({ id: "F-1" })];
    const findings = checkJsonSync(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should flag features in JSON but not in DB", () => {
    writeFileSync(
      join(TEST_DIR, "features.json"),
      JSON.stringify([
        { id: "F-1", name: "Feature 1", description: "desc" },
        { id: "F-2", name: "Feature 2", description: "desc" },
      ])
    );
    const features = [makeFeature({ id: "F-1" })];
    const findings = checkJsonSync(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].featureId).toBe("F-2");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("In features.json but not in database");
  });

  it("should flag features in DB but not in JSON", () => {
    writeFileSync(
      join(TEST_DIR, "features.json"),
      JSON.stringify([{ id: "F-1", name: "Feature 1" }])
    );
    const features = [
      makeFeature({ id: "F-1" }),
      makeFeature({ id: "F-2", status: "pending" }),
    ];
    const findings = checkJsonSync(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].featureId).toBe("F-2");
    expect(findings[0].message).toContain("In database but not in features.json");
  });

  it("should not flag skipped DB features missing from JSON", () => {
    writeFileSync(
      join(TEST_DIR, "features.json"),
      JSON.stringify([{ id: "F-1", name: "Feature 1" }])
    );
    const features = [
      makeFeature({ id: "F-1" }),
      makeFeature({ id: "F-2", status: "skipped" }),
    ];
    const findings = checkJsonSync(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should handle normalized ID matching (F-001 vs F-1)", () => {
    writeFileSync(
      join(TEST_DIR, "features.json"),
      JSON.stringify([{ id: "F-1", name: "Feature 1" }])
    );
    // DB has zero-padded ID
    const features = [makeFeature({ id: "F-001" })];
    const findings = checkJsonSync(features, TEST_DIR);
    // Should match -- no findings
    expect(findings).toEqual([]);
  });

  it("should flag malformed JSON", () => {
    writeFileSync(join(TEST_DIR, "features.json"), "not valid json{{{");
    const features = [makeFeature({ id: "F-1" })];
    const findings = checkJsonSync(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("malformed");
  });
});
