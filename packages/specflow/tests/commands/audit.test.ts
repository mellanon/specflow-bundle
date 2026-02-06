import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  updateFeatureStatus,
  updateFeaturePhase,
  updateFeatureSpecPath,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-audit-cmd-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

function runCli(
  args: string[],
  cwd?: string
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("bun", ["run", CLI_PATH, ...args], {
    encoding: "utf-8",
    cwd: cwd ?? TEST_PROJECT_DIR,
    env: { ...process.env },
  });
  return {
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
    exitCode: result.status ?? 1,
  };
}

describe("audit command (CLI)", () => {
  beforeEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should show error when no database exists", () => {
    // Remove the specflow dir to simulate no init
    rmSync(TEST_SPECFLOW_DIR, { recursive: true });
    const { stderr, exitCode } = runCli(["audit"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("No SpecFlow database");
  });

  it("should show healthy report when no findings", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test Feature", description: "desc", priority: 1 });
    closeDatabase();

    const { stdout, exitCode } = runCli(["audit"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("1 features");
    expect(stdout).toContain("No findings");
  });

  it("should return exit code 1 when critical findings exist", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureSpecPath("F-1", join(TEST_PROJECT_DIR, "nonexistent"));
    closeDatabase();

    const { stdout, exitCode } = runCli(["audit"]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("CRITICAL");
  });

  it("should output valid JSON with --json flag", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    closeDatabase();

    const { stdout } = runCli(["audit", "--json"]);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("auditedAt");
    expect(report).toHaveProperty("featureCount");
    expect(report).toHaveProperty("findings");
    expect(report).toHaveProperty("summary");
    expect(report.featureCount).toBe(1);
  });

  it("should output only fix commands with --fix flag", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureSpecPath("F-1", join(TEST_PROJECT_DIR, "nonexistent"));
    closeDatabase();

    const { stdout } = runCli(["audit", "--fix"]);
    // Each line should be a command
    const lines = stdout.trim().split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeGreaterThan(0);
    // Fix commands should contain specflow
    expect(lines.some((l) => l.includes("specflow"))).toBe(true);
  });

  it("should audit a single feature", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    addFeature({ id: "F-2", name: "B", description: "desc", priority: 2 });
    closeDatabase();

    const { stdout } = runCli(["audit", "F-1", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.featureCount).toBe(1);
  });

  it("should filter by --check", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    updateFeatureStatus("F-1", "complete");
    updateFeatureSpecPath("F-1", join(TEST_PROJECT_DIR, "nonexistent"));
    closeDatabase();

    const { stdout } = runCli(["audit", "--check", "db-status", "--json"]);
    const report = JSON.parse(stdout);
    for (const finding of report.findings) {
      expect(finding.check).toBe("db-status");
    }
  });

  it("should reject invalid --check values", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    closeDatabase();

    const { stderr, exitCode } = runCli(["audit", "--check", "invalid-check"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid check name");
  });

  it("should filter by --status", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "A", description: "desc", priority: 1 });
    addFeature({ id: "F-2", name: "B", description: "desc", priority: 2 });
    updateFeatureStatus("F-1", "complete");
    closeDatabase();

    const { stdout } = runCli(["audit", "--status", "pending", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.featureCount).toBe(1);
  });

  it("should detect json-sync mismatches", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Feature One", description: "desc", priority: 1 });
    closeDatabase();

    // Write features.json with an extra feature
    writeFileSync(
      join(TEST_PROJECT_DIR, "features.json"),
      JSON.stringify([
        { id: "F-1", name: "Feature One" },
        { id: "F-99", name: "Ghost Feature", description: "not in db" },
      ])
    );

    const { stdout } = runCli(["audit", "--check", "json-sync", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.findings.some((f: any) => f.featureId === "F-99")).toBe(true);
  });

  it("should detect phase artifact mismatches", () => {
    initDatabase(TEST_DB_PATH);
    const specDir = join(TEST_PROJECT_DIR, "specs", "f-001");
    mkdirSync(specDir, { recursive: true });
    // Phase=specify but no spec.md in the specDir
    addFeature({ id: "F-1", name: "Test", description: "desc", priority: 1 });
    updateFeaturePhase("F-1", "specify");
    updateFeatureSpecPath("F-1", specDir);
    closeDatabase();

    const { stdout } = runCli(["audit", "--check", "phase-artifacts", "--json"]);
    const report = JSON.parse(stdout);
    expect(report.findings.some((f: any) => f.check === "phase-artifacts")).toBe(true);
    expect(
      report.findings.some((f: any) => f.message.includes("spec.md missing"))
    ).toBe(true);
  });
});
