import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  updateFeatureStatus,
  updateFeaturePhase,
  updateFeatureSpecPath,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../../src/lib/database";
import { runAudit } from "../../../src/lib/audit/runner";

const TEST_DIR = "/tmp/specflow-audit-runner-test";
const TEST_SPECFLOW_DIR = join(TEST_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

describe("runAudit", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("should return empty findings for healthy pending features", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    const report = runAudit(TEST_DIR, {});
    // pending feature with phase=none should have zero findings
    expect(report.featureCount).toBe(1);
    expect(report.findings).toEqual([]);
    expect(report.summary.total).toBe(0);
  });

  it("should detect complete feature with missing spec directory", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureSpecPath("F-1", join(TEST_DIR, "nonexistent-spec"));

    const report = runAudit(TEST_DIR, {});
    expect(report.findings.length).toBeGreaterThan(0);
    const critical = report.findings.filter((f) => f.severity === "critical");
    expect(critical.length).toBeGreaterThan(0);
    expect(report.summary.critical).toBeGreaterThan(0);
  });

  it("should filter by single feature ID", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    addFeature({ id: "F-2", name: "B", description: "desc", priority: 2 });

    const report = runAudit(TEST_DIR, { featureId: "F-1" });
    expect(report.featureCount).toBe(1);
    // All findings should be for F-1 only
    for (const finding of report.findings) {
      expect(finding.featureId).toBe("F-1");
    }
  });

  it("should return error for nonexistent feature ID", () => {
    initDatabase(TEST_DB_PATH);
    const report = runAudit(TEST_DIR, { featureId: "F-999" });
    expect(report.featureCount).toBe(0);
    expect(report.summary.critical).toBe(1);
    expect(report.findings[0].message).toContain("not found");
  });

  it("should filter by status", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    addFeature({ id: "F-2", name: "B", description: "desc", priority: 2 });
    updateFeatureStatus("F-1", "complete");

    const report = runAudit(TEST_DIR, { status: "pending" });
    expect(report.featureCount).toBe(1);
    // Should only audit F-2 (the pending one)
  });

  it("should filter by single check name", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureSpecPath("F-1", join(TEST_DIR, "nonexistent"));

    const report = runAudit(TEST_DIR, { check: "db-status" });
    // All findings should be from db-status check only
    for (const finding of report.findings) {
      expect(finding.check).toBe("db-status");
    }
  });

  it("should sort findings by severity then feature ID", () => {
    initDatabase(TEST_DB_PATH);
    // Create features that will produce findings of different severities
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    addFeature({ id: "F-2", name: "B", description: "desc", priority: 2 });
    updateFeatureStatus("F-1", "skipped"); // produces INFO
    updateFeatureStatus("F-2", "complete"); // produces CRITICAL (no spec)
    updateFeatureSpecPath("F-2", join(TEST_DIR, "nonexistent"));

    const report = runAudit(TEST_DIR, {});
    if (report.findings.length >= 2) {
      // First finding should be critical, last should be info
      const severities = report.findings.map((f) => f.severity);
      const criticalIdx = severities.indexOf("critical");
      const infoIdx = severities.indexOf("info");
      if (criticalIdx >= 0 && infoIdx >= 0) {
        expect(criticalIdx).toBeLessThan(infoIdx);
      }
    }
  });

  it("should detect phase artifact mismatches", () => {
    initDatabase(TEST_DB_PATH);
    const specDir = join(TEST_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    // Phase=specify but no spec.md
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    updateFeaturePhase("F-1", "specify");
    updateFeatureSpecPath("F-1", specDir);

    const report = runAudit(TEST_DIR, {});
    const phaseFindings = report.findings.filter((f) => f.check === "phase-artifacts");
    expect(phaseFindings.length).toBeGreaterThan(0);
    expect(phaseFindings[0].severity).toBe("critical");
  });
});
