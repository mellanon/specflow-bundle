/**
 * Test Results Artifact I/O
 * Atomic read/write utilities for test results in .specify/tests/
 *
 * Provides traceability for unit tests - every test run is preserved with:
 * - Timestamped history files
 * - Iteration tracking
 * - Delta calculations (which tests changed between runs)
 * - Progress trends
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

export interface TestResult {
  id: string; // Stable ID like "UT-42" for traceability
  name: string;
  file: string;
  status: "pass" | "fail" | "skip";
  duration?: number;
  error?: string;
}

// =============================================================================
// Test Registry - Stable ID Assignment
// =============================================================================

interface TestRegistry {
  nextId: number;
  tests: Record<string, string>; // "file::name" -> "UT-{n}"
}

/**
 * Load or create the test registry
 */
function loadTestRegistry(projectPath: string): TestRegistry {
  const dir = testResultsDir(projectPath);
  const registryPath = join(dir, "test-registry.json");

  if (existsSync(registryPath)) {
    return JSON.parse(readFileSync(registryPath, "utf-8"));
  }

  return { nextId: 1, tests: {} };
}

/**
 * Save the test registry
 */
function saveTestRegistry(projectPath: string, registry: TestRegistry): void {
  const dir = testResultsDir(projectPath);
  const registryPath = join(dir, "test-registry.json");
  atomicWriteJson(registryPath, registry);
}

/**
 * Get or assign a stable ID for a test
 * IDs are assigned on first encounter and never change
 */
export function getTestId(projectPath: string, file: string, name: string): string {
  const registry = loadTestRegistry(projectPath);
  const key = `${file}::${name}`;

  if (registry.tests[key]) {
    return registry.tests[key];
  }

  // Assign new ID
  const id = `UT-${registry.nextId}`;
  registry.tests[key] = id;
  registry.nextId++;
  saveTestRegistry(projectPath, registry);

  return id;
}

/**
 * Batch assign IDs for efficiency (single registry load/save)
 */
export function assignTestIds(
  projectPath: string,
  tests: Array<{ file: string; name: string }>
): Map<string, string> {
  const registry = loadTestRegistry(projectPath);
  const idMap = new Map<string, string>();
  let modified = false;

  for (const test of tests) {
    const key = `${test.file}::${test.name}`;

    if (registry.tests[key]) {
      idMap.set(key, registry.tests[key]);
    } else {
      const id = `UT-${registry.nextId}`;
      registry.tests[key] = id;
      registry.nextId++;
      idMap.set(key, id);
      modified = true;
    }
  }

  if (modified) {
    saveTestRegistry(projectPath, registry);
  }

  return idMap;
}

/**
 * Get test key (file::name) from ID
 */
export function getTestKeyFromId(projectPath: string, id: string): string | null {
  const registry = loadTestRegistry(projectPath);
  for (const [key, testId] of Object.entries(registry.tests)) {
    if (testId === id) {
      return key;
    }
  }
  return null;
}

export interface TestRunResult {
  runAt: string;
  duration: number;
  tests: TestResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
  };
  gitSha?: string;
  branch?: string;
}

export interface EnrichedTestRun extends TestRunResult {
  iteration: number;
  delta: {
    passChange: number;
    failChange: number;
    newPasses: string[];
    newFailures: string[];
    fixedTests: string[];
    brokenTests: string[];
  } | null;
  previousRunAt: string | null;
}

/**
 * Get the test results directory, creating if absent
 */
export function testResultsDir(projectPath: string): string {
  const dir = join(projectPath, ".specify", "tests");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Atomically write JSON to a file (write .tmp then rename)
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, filePath);
}

/**
 * Read and parse a JSON file, returning null if missing
 */
function readJsonOptional<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

/**
 * Write test run result with history preservation
 * - Assigns stable IDs to all tests via registry
 * - Saves timestamped copy to history/ subdirectory
 * - Updates latest.json for quick access
 * - Computes iteration number and delta from previous run (using IDs)
 */
export function writeTestRun(projectPath: string, data: TestRunResult): string {
  const dir = testResultsDir(projectPath);
  const latestPath = join(dir, "latest.json");

  // Assign stable IDs to all tests
  const idMap = assignTestIds(
    projectPath,
    data.tests.map((t) => ({ file: t.file, name: t.name }))
  );

  // Update tests with their IDs
  const testsWithIds = data.tests.map((t) => ({
    ...t,
    id: idMap.get(`${t.file}::${t.name}`) || t.id || "UT-?",
  }));

  const dataWithIds = { ...data, tests: testsWithIds };

  // Create history directory
  const historyDir = join(dir, "history");
  mkdirSync(historyDir, { recursive: true });

  // Determine iteration number
  const existingRuns = existsSync(historyDir)
    ? readdirSync(historyDir).filter((f) => f.endsWith(".json")).length
    : 0;
  const iteration = existingRuns + 1;

  // Load previous run for delta calculation
  const previousRun = readLatestTestRun(projectPath);
  let delta: EnrichedTestRun["delta"] = null;

  if (previousRun) {
    // Use IDs for comparison (stable across renames)
    const prevById = new Map(previousRun.tests.map((t) => [t.id, t.status]));

    const newPasses: string[] = [];
    const newFailures: string[] = [];
    const fixedTests: string[] = [];
    const brokenTests: string[] = [];

    // Check current tests against previous using IDs
    for (const test of testsWithIds) {
      const prevStatus = prevById.get(test.id);

      if (test.status === "pass") {
        if (!prevStatus) {
          newPasses.push(test.id); // New test that passes
        } else if (prevStatus === "fail") {
          fixedTests.push(test.id); // Was failing, now passes
        }
      } else if (test.status === "fail") {
        if (!prevStatus) {
          newFailures.push(test.id); // New test that fails
        } else if (prevStatus === "pass") {
          brokenTests.push(test.id); // Was passing, now fails
        }
      }
    }

    delta = {
      passChange: dataWithIds.summary.pass - previousRun.summary.pass,
      failChange: dataWithIds.summary.fail - previousRun.summary.fail,
      newPasses,
      newFailures,
      fixedTests,
      brokenTests,
    };
  }

  // Enrich data with iteration metadata
  const enrichedData: EnrichedTestRun = {
    ...dataWithIds,
    iteration,
    delta,
    previousRunAt: previousRun?.runAt || null,
  };

  // Write timestamped history file
  const timestamp = dataWithIds.runAt.replace(/[:.]/g, "-");
  const historyPath = join(historyDir, `${timestamp}_run${iteration}.json`);
  atomicWriteJson(historyPath, enrichedData);

  // Write latest (for quick access)
  atomicWriteJson(latestPath, enrichedData);

  return latestPath;
}

/**
 * Read the latest test run result
 */
export function readLatestTestRun(projectPath: string): EnrichedTestRun | null {
  const dir = testResultsDir(projectPath);
  return readJsonOptional<EnrichedTestRun>(join(dir, "latest.json"));
}

/**
 * Get test run history, ordered by iteration (oldest first)
 */
export function getTestRunHistory(projectPath: string): EnrichedTestRun[] {
  const dir = testResultsDir(projectPath);
  const historyDir = join(dir, "history");

  if (!existsSync(historyDir)) {
    return [];
  }

  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json"))
    .sort(); // Lexicographic sort works because of timestamp format

  return files.map((file) => {
    const content = readFileSync(join(historyDir, file), "utf-8");
    return JSON.parse(content);
  });
}

/**
 * Get a summary of test progress
 */
export function getTestProgressSummary(projectPath: string): {
  totalRuns: number;
  firstRun: { date: string; pass: number; fail: number } | null;
  latestRun: { date: string; pass: number; fail: number; iteration: number } | null;
  trend: "improving" | "regressing" | "stable" | "unknown";
  passRateHistory: number[];
  flakyTests: string[]; // Tests that have toggled pass/fail multiple times
} | null {
  const history = getTestRunHistory(projectPath);

  if (history.length === 0) {
    return null;
  }

  const passRateHistory = history.map((h) =>
    h.summary.total > 0 ? (h.summary.pass / h.summary.total) * 100 : 0
  );

  const firstRun = history[0];
  const latestRun = history[history.length - 1];

  // Determine trend based on last 3 runs
  let trend: "improving" | "regressing" | "stable" | "unknown" = "unknown";
  if (history.length >= 2) {
    const recentRates = passRateHistory.slice(-3);
    const isImproving = recentRates.every((rate, i) => i === 0 || rate >= recentRates[i - 1]);
    const isRegressing = recentRates.every((rate, i) => i === 0 || rate <= recentRates[i - 1]);

    if (isImproving && recentRates[recentRates.length - 1] > recentRates[0]) {
      trend = "improving";
    } else if (isRegressing && recentRates[recentRates.length - 1] < recentRates[0]) {
      trend = "regressing";
    } else {
      trend = "stable";
    }
  }

  // Detect flaky tests (toggled multiple times across history)
  const testStatusChanges = new Map<string, number>();
  for (let i = 1; i < history.length; i++) {
    const delta = history[i].delta;
    if (delta) {
      for (const test of [...delta.fixedTests, ...delta.brokenTests]) {
        testStatusChanges.set(test, (testStatusChanges.get(test) || 0) + 1);
      }
    }
  }
  const flakyTests = [...testStatusChanges.entries()]
    .filter(([, changes]) => changes >= 2)
    .map(([test]) => test);

  return {
    totalRuns: history.length,
    firstRun: {
      date: firstRun.runAt,
      pass: firstRun.summary.pass,
      fail: firstRun.summary.fail,
    },
    latestRun: {
      date: latestRun.runAt,
      pass: latestRun.summary.pass,
      fail: latestRun.summary.fail,
      iteration: latestRun.iteration,
    },
    trend,
    passRateHistory,
    flakyTests,
  };
}

/**
 * Parse bun test JUnit XML output into TestRunResult
 * Run with: bun test --reporter=junit --reporter-outfile=<file>
 */
export function parseJUnitXml(xmlContent: string, gitSha?: string, branch?: string): TestRunResult {
  const tests: TestResult[] = [];
  let totalTime = 0;

  // Extract testsuites attributes
  const testsuitesMatch = xmlContent.match(/<testsuites[^>]*tests="(\d+)"[^>]*failures="(\d+)"[^>]*skipped="(\d+)"[^>]*time="([^"]+)"/);
  const total = testsuitesMatch ? parseInt(testsuitesMatch[1], 10) : 0;
  const fail = testsuitesMatch ? parseInt(testsuitesMatch[2], 10) : 0;
  const skip = testsuitesMatch ? parseInt(testsuitesMatch[3], 10) : 0;
  const pass = total - fail - skip;
  totalTime = testsuitesMatch ? parseFloat(testsuitesMatch[4]) : 0;

  // Extract testcases
  const testcaseRegex = /<testcase\s+name="([^"]+)"[^>]*classname="([^"]*)"[^>]*time="([^"]+)"[^>]*file="([^"]*)"[^>]*(?:\/>|>[\s\S]*?<\/testcase>)/g;
  let match;
  let testIndex = 0;

  while ((match = testcaseRegex.exec(xmlContent)) !== null) {
    const [fullMatch, name, classname, time, file] = match;
    const hasFailure = fullMatch.includes("<failure");
    const hasSkipped = fullMatch.includes("<skipped");

    let error: string | undefined;
    if (hasFailure) {
      const failureMatch = fullMatch.match(/<failure[^>]*>([^<]*)<\/failure>/);
      error = failureMatch ? failureMatch[1] : "Test failed";
    }

    testIndex++;
    tests.push({
      id: `UT-${testIndex}`, // Temporary ID, will be replaced by registry lookup in writeTestRun
      name: name.replace(/&amp;gt;/g, ">").replace(/&amp;/g, "&"),
      file,
      status: hasFailure ? "fail" : hasSkipped ? "skip" : "pass",
      duration: parseFloat(time) * 1000, // Convert to milliseconds
      error,
    });
  }

  return {
    runAt: new Date().toISOString(),
    duration: totalTime * 1000,
    tests,
    summary: { total, pass, fail, skip },
    gitSha,
    branch,
  };
}

/**
 * Parse bun test standard output (text format) into TestRunResult
 * Fallback when JUnit format is not available
 */
export function parseBunTextOutput(textOutput: string, gitSha?: string, branch?: string): TestRunResult {
  const tests: TestResult[] = [];

  // Parse summary line: "N pass\nM fail"
  const passMatch = textOutput.match(/(\d+)\s+pass/);
  const failMatch = textOutput.match(/(\d+)\s+fail/);
  const skipMatch = textOutput.match(/(\d+)\s+skip/);

  const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
  const fail = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skip = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  const total = pass + fail + skip;

  // Parse duration: "Ran N tests across M files. [Xms]"
  const durationMatch = textOutput.match(/\[(\d+(?:\.\d+)?)\s*ms\]/);
  const duration = durationMatch ? parseFloat(durationMatch[1]) : 0;

  // Parse individual test results (look for check marks and x marks)
  const testLineRegex = /^\s*(?:✓|✔|✅)\s+(.+)$/gm;
  const failLineRegex = /^\s*(?:✗|✖|❌|×)\s+(.+)$/gm;

  let testMatch;
  let testIndex = 0;
  while ((testMatch = testLineRegex.exec(textOutput)) !== null) {
    testIndex++;
    tests.push({
      id: `UT-${testIndex}`, // Temporary ID, replaced by registry in writeTestRun
      name: testMatch[1].trim(),
      file: "unknown",
      status: "pass",
    });
  }
  while ((testMatch = failLineRegex.exec(textOutput)) !== null) {
    testIndex++;
    tests.push({
      id: `UT-${testIndex}`, // Temporary ID, replaced by registry in writeTestRun
      name: testMatch[1].trim(),
      file: "unknown",
      status: "fail",
    });
  }

  return {
    runAt: new Date().toISOString(),
    duration,
    tests,
    summary: { total, pass, fail, skip },
    gitSha,
    branch,
  };
}
