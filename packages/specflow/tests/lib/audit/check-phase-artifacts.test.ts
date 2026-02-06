import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { checkPhaseArtifacts } from "../../../src/lib/audit/check-phase-artifacts";
import type { Feature } from "../../../src/types";

const TEST_DIR = "/tmp/specflow-audit-phase-artifacts-test";

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

describe("checkPhaseArtifacts", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("should skip features with phase=none", () => {
    const features = [makeFeature({ id: "F-1", phase: "none" })];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should skip skipped features", () => {
    const features = [
      makeFeature({ id: "F-1", phase: "specify", status: "skipped" }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should flag CRITICAL when specify phase but spec.md missing", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    // Don't create spec.md

    const features = [
      makeFeature({ id: "F-1", phase: "specify", specPath: specDir }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].message).toContain("spec.md missing");
    expect(findings[0].suggestedFix).toContain("specflow specify F-1");
  });

  it("should not flag when specify phase and spec.md exists", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# Spec");

    const features = [
      makeFeature({ id: "F-1", phase: "specify", specPath: specDir }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toEqual([]);
  });

  it("should flag CRITICAL when plan phase but plan.md missing", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# Spec");
    // plan.md missing

    const features = [
      makeFeature({ id: "F-1", phase: "plan", specPath: specDir }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("plan.md missing");
    expect(findings[0].suggestedFix).toContain("specflow plan F-1");
  });

  it("should flag CRITICAL when tasks phase but tasks.md missing", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# Spec");
    writeFileSync(join(specDir, "plan.md"), "# Plan");
    // tasks.md missing

    const features = [
      makeFeature({ id: "F-1", phase: "tasks", specPath: specDir }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("tasks.md missing");
    expect(findings[0].suggestedFix).toContain("specflow tasks F-1");
  });

  it("should flag CRITICAL when phase set but no specPath configured", () => {
    const features = [
      makeFeature({ id: "F-1", phase: "specify", specPath: null }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].message).toContain("no spec path configured");
  });

  it("should flag WARNING when harden directory has no results.json", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# Spec");

    const hardenDir = join(TEST_DIR, ".specify", "harden", "f-1");
    mkdirSync(hardenDir, { recursive: true });
    writeFileSync(join(hardenDir, "acceptance-test.md"), "# AT");
    // No results.json

    const features = [
      makeFeature({ id: "F-1", phase: "implement", specPath: specDir }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings.some((f) => f.message.includes("results.json missing"))).toBe(true);
  });

  it("should flag WARNING when review directory has no review-package.md", () => {
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# Spec");

    const reviewDir = join(TEST_DIR, ".specify", "review", "f-1");
    mkdirSync(reviewDir, { recursive: true });
    // No review-package.md

    const features = [
      makeFeature({ id: "F-1", phase: "implement", specPath: specDir }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(findings.some((f) => f.message.includes("review-package.md missing"))).toBe(true);
  });

  it("should flag CRITICAL when evolving but no baselines manifest", () => {
    const specDir = join(TEST_DIR, "specs", "f-017");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "spec.md"), "# Spec");

    const features = [
      makeFeature({
        id: "F-17",
        phase: "implement",
        status: "evolving",
        specPath: specDir,
      }),
    ];
    const findings = checkPhaseArtifacts(features, TEST_DIR);
    expect(
      findings.some(
        (f) => f.severity === "critical" && f.message.includes("manifest.json missing")
      )
    ).toBe(true);
  });
});
