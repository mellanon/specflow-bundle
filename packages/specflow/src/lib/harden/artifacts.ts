/**
 * Harden Artifact I/O — F-023
 * Atomic read/write utilities for JSON artifacts in .specify/harden/{featureId}/
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type {
  EvaluationResult,
  TriageResult,
  FixDescriptors,
  ConvergenceResult,
} from "../../types";

/**
 * Get the harden directory for a feature, creating it if absent
 */
export function hardenDir(projectPath: string, featureId: string): string {
  const dir = join(projectPath, ".specify", "harden", featureId.toLowerCase());
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
 * Read and parse a JSON file, throwing a clear error if missing
 */
function readJson<T>(filePath: string, label: string): T {
  if (!existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}. Run the prerequisite subcommand first.`);
  }
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

/**
 * Read a JSON file, returning null if missing
 */
function readJsonOptional<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

// === Evaluation ===

/**
 * Write evaluation result with history preservation
 * - Saves timestamped copy to evaluations/ subdirectory
 * - Updates evaluation.json as "latest" for backwards compatibility
 * - Computes iteration number and delta from previous run
 */
export function writeEvaluation(projectPath: string, featureId: string, data: EvaluationResult): string {
  const dir = hardenDir(projectPath, featureId);
  const latestPath = join(dir, "evaluation.json");

  // Create evaluations history directory
  const historyDir = join(dir, "evaluations");
  mkdirSync(historyDir, { recursive: true });

  // Determine iteration number
  const existingRuns = existsSync(historyDir)
    ? readdirSync(historyDir).filter((f) => f.endsWith(".json")).length
    : 0;
  const iteration = existingRuns + 1;

  // Load previous run for delta calculation
  const previousRun = readEvaluationOptional(projectPath, featureId);
  let delta: { passChange: number; failChange: number; newPasses: string[]; newFailures: string[] } | null = null;

  if (previousRun) {
    const prevPassIds = new Set(previousRun.testCases.filter((t) => t.status === "pass").map((t) => t.id));
    const prevFailIds = new Set(previousRun.testCases.filter((t) => t.status === "fail").map((t) => t.id));
    const currPassIds = new Set(data.testCases.filter((t) => t.status === "pass").map((t) => t.id));
    const currFailIds = new Set(data.testCases.filter((t) => t.status === "fail").map((t) => t.id));

    delta = {
      passChange: data.summary.pass - previousRun.summary.pass,
      failChange: data.summary.fail - previousRun.summary.fail,
      newPasses: [...currPassIds].filter((id) => !prevPassIds.has(id)),
      newFailures: [...currFailIds].filter((id) => !prevFailIds.has(id)),
    };
  }

  // Enrich data with iteration metadata
  const enrichedData = {
    ...data,
    iteration,
    delta,
    previousRunAt: previousRun?.evaluatedAt || null,
  };

  // Write timestamped history file
  const timestamp = data.evaluatedAt.replace(/[:.]/g, "-");
  const historyPath = join(historyDir, `${timestamp}_run${iteration}.json`);
  atomicWriteJson(historyPath, enrichedData);

  // Write latest (for backwards compatibility)
  atomicWriteJson(latestPath, enrichedData);

  return latestPath;
}

export function readEvaluation(projectPath: string, featureId: string): EvaluationResult {
  const dir = hardenDir(projectPath, featureId);
  return readJson<EvaluationResult>(join(dir, "evaluation.json"), "evaluation.json");
}

export function readEvaluationOptional(projectPath: string, featureId: string): EvaluationResult | null {
  const dir = hardenDir(projectPath, featureId);
  return readJsonOptional<EvaluationResult>(join(dir, "evaluation.json"));
}

/**
 * Get evaluation history for a feature, ordered by iteration (oldest first)
 * Returns array of enriched evaluation results with iteration metadata
 */
export function getEvaluationHistory(
  projectPath: string,
  featureId: string
): Array<EvaluationResult & { iteration: number; delta: unknown }> {
  const dir = hardenDir(projectPath, featureId);
  const historyDir = join(dir, "evaluations");

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
 * Get a summary of evaluation progress for a feature
 */
export function getEvaluationProgressSummary(
  projectPath: string,
  featureId: string
): {
  totalRuns: number;
  firstRun: { date: string; pass: number; fail: number } | null;
  latestRun: { date: string; pass: number; fail: number; iteration: number } | null;
  trend: "improving" | "regressing" | "stable" | "unknown";
  passRateHistory: number[];
} | null {
  const history = getEvaluationHistory(projectPath, featureId);

  if (history.length === 0) {
    return null;
  }

  const passRateHistory = history.map((h) =>
    h.summary.total > 0 ? (h.summary.pass / h.summary.total) * 100 : 0
  );

  const firstRun = history[0];
  const latestRun = history[history.length - 1];

  // Determine trend based on last 3 runs (or fewer if not enough history)
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

  return {
    totalRuns: history.length,
    firstRun: {
      date: firstRun.evaluatedAt,
      pass: firstRun.summary.pass,
      fail: firstRun.summary.fail,
    },
    latestRun: {
      date: latestRun.evaluatedAt,
      pass: latestRun.summary.pass,
      fail: latestRun.summary.fail,
      iteration: (latestRun as unknown as { iteration: number }).iteration || history.length,
    },
    trend,
    passRateHistory,
  };
}

// === Triage ===

export function writeTriage(projectPath: string, featureId: string, data: TriageResult): string {
  const dir = hardenDir(projectPath, featureId);
  const filePath = join(dir, "triage.json");
  atomicWriteJson(filePath, data);
  return filePath;
}

export function readTriage(projectPath: string, featureId: string): TriageResult {
  const dir = hardenDir(projectPath, featureId);
  return readJson<TriageResult>(join(dir, "triage.json"), "triage.json");
}

export function readTriageOptional(projectPath: string, featureId: string): TriageResult | null {
  const dir = hardenDir(projectPath, featureId);
  return readJsonOptional<TriageResult>(join(dir, "triage.json"));
}

// === Fixes ===

export function writeFixes(projectPath: string, featureId: string, data: FixDescriptors): string {
  const dir = hardenDir(projectPath, featureId);
  const filePath = join(dir, "fixes.json");
  atomicWriteJson(filePath, data);
  return filePath;
}

export function readFixes(projectPath: string, featureId: string): FixDescriptors {
  const dir = hardenDir(projectPath, featureId);
  return readJson<FixDescriptors>(join(dir, "fixes.json"), "fixes.json");
}

export function readFixesOptional(projectPath: string, featureId: string): FixDescriptors | null {
  const dir = hardenDir(projectPath, featureId);
  return readJsonOptional<FixDescriptors>(join(dir, "fixes.json"));
}

// === Convergence ===

export function writeConvergence(projectPath: string, featureId: string, data: ConvergenceResult): string {
  const dir = hardenDir(projectPath, featureId);
  const filePath = join(dir, "convergence.json");
  atomicWriteJson(filePath, data);
  return filePath;
}

export function readConvergence(projectPath: string, featureId: string): ConvergenceResult {
  const dir = hardenDir(projectPath, featureId);
  return readJson<ConvergenceResult>(join(dir, "convergence.json"), "convergence.json");
}

export function readConvergenceOptional(projectPath: string, featureId: string): ConvergenceResult | null {
  const dir = hardenDir(projectPath, featureId);
  return readJsonOptional<ConvergenceResult>(join(dir, "convergence.json"));
}
