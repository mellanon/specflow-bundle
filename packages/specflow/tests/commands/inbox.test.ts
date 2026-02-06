/**
 * CLI integration tests for inbox command (F-025)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  getDbInstance,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";
import { writeReviewJson } from "../../src/lib/review/artifacts";
import type { ReviewResult } from "../../src/types";

const CLI_PATH = join(import.meta.dir, "../../src/index.ts");
const TEST_PROJECT_DIR = "/tmp/specflow-inbox-cli-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; exitCode: number } {
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

function makeReview(featureId: string, passed: boolean): ReviewResult {
  return {
    featureId,
    featureName: `feature-${featureId}`,
    reviewedAt: new Date().toISOString(),
    passed,
    automatedChecks: {
      passed,
      checks: [{ name: "typecheck", passed, duration: 100 }],
      alignment: { matched: 5, missing: passed ? 0 : 2 },
    },
    acceptanceTests: {
      available: true,
      total: 3,
      pass: passed ? 3 : 1,
      fail: passed ? 0 : 2,
      skip: 0,
      pending: 0,
    },
    summary: {
      checksPass: passed,
      acceptanceTestsPass: passed,
    },
  };
}

function insertPendingGate(featureId: string, triggeredAt?: string): void {
  const db = getDbInstance();
  const now = triggeredAt ?? new Date().toISOString();
  db.run(
    `INSERT INTO approval_gates (feature_id, phase_boundary, urgency, status, triggered_at)
     VALUES (?, 'implement_to_complete', 'review', 'pending', ?)`,
    [featureId, now],
  );
}

describe("inbox command (CLI)", () => {
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

  it("should show empty state when no pending gates", () => {
    initDatabase(TEST_DB_PATH);
    closeDatabase();

    const { stdout, exitCode } = runCli(["inbox"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Inbox empty");
  });

  it("should show inbox items with priorities", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Auth", description: "Desc", priority: 1 });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    insertPendingGate("F-1", twoHoursAgo);
    writeReviewJson(TEST_PROJECT_DIR, "F-1", makeReview("F-1", true));
    closeDatabase();

    const { stdout, exitCode } = runCli(["inbox"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Review Inbox");
    expect(stdout).toContain("F-1");
    expect(stdout).toContain("Auth");
    expect(stdout).toContain("P1");
  });

  it("should output valid JSON with --json flag", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Auth", description: "Desc", priority: 1 });
    insertPendingGate("F-1");
    closeDatabase();

    const { stdout, exitCode } = runCli(["inbox", "--json"]);

    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.queue).toHaveLength(1);
    expect(json.queue[0].featureId).toBe("F-1");
    expect(json.summary.total).toBe(1);
  });

  it("should show verbose output with --verbose flag", () => {
    initDatabase(TEST_DB_PATH);
    addFeature({ id: "F-1", name: "Auth", description: "Desc", priority: 1 });
    insertPendingGate("F-1");
    closeDatabase();

    const { stdout, exitCode } = runCli(["inbox", "--verbose"]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Verdict:");
    expect(stdout).toContain("Decision:");
    expect(stdout).toContain("Review:");
  });

  it("should show error when no database exists", () => {
    // No database created - just run against empty dir
    const { stderr, exitCode } = runCli(["inbox"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("No SpecFlow database found");
  });
});
