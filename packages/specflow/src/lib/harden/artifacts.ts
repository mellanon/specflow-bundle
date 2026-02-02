/**
 * Harden Artifact I/O — F-023
 * Atomic read/write utilities for JSON artifacts in .specify/harden/{featureId}/
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync } from "fs";
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

export function writeEvaluation(projectPath: string, featureId: string, data: EvaluationResult): string {
  const dir = hardenDir(projectPath, featureId);
  const filePath = join(dir, "evaluation.json");
  atomicWriteJson(filePath, data);
  return filePath;
}

export function readEvaluation(projectPath: string, featureId: string): EvaluationResult {
  const dir = hardenDir(projectPath, featureId);
  return readJson<EvaluationResult>(join(dir, "evaluation.json"), "evaluation.json");
}

export function readEvaluationOptional(projectPath: string, featureId: string): EvaluationResult | null {
  const dir = hardenDir(projectPath, featureId);
  return readJsonOptional<EvaluationResult>(join(dir, "evaluation.json"));
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
