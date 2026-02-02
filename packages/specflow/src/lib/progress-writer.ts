import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ProgressFile, PipelinePhaseEntry } from "../types";

const PROGRESS_DIR = ".specify/pipeline";
const PROGRESS_FILE = "progress.json";

function getProgressPath(projectPath: string): string {
  return join(projectPath, PROGRESS_DIR, PROGRESS_FILE);
}

function writeAtomic(path: string, data: ProgressFile): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

function readCurrent(path: string): ProgressFile | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function initProgressFile(
  projectPath: string,
  featureId: string,
  featureName: string,
  phases: string[],
): ProgressFile {
  const path = getProgressPath(projectPath);
  const now = new Date().toISOString();

  const data: ProgressFile = {
    feature_id: featureId,
    feature_name: featureName,
    current_phase: phases[0] ?? "",
    status: "running",
    started_at: now,
    completed_at: null,
    phases: phases.map((name) => ({
      name,
      status: "pending",
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      artifacts_produced: [],
    })),
    errors: [],
  };

  writeAtomic(path, data);
  return data;
}

export function updatePhaseStart(projectPath: string, phase: string): void {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return;

  const entry = data.phases.find((p) => p.name === phase);
  if (entry) {
    entry.status = "running";
    entry.started_at = new Date().toISOString();
  }
  data.current_phase = phase;

  writeAtomic(path, data);
}

export function updatePhaseComplete(
  projectPath: string,
  phase: string,
  artifacts: string[],
): void {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return;

  const entry = data.phases.find((p) => p.name === phase);
  if (entry) {
    entry.status = "complete";
    entry.completed_at = new Date().toISOString();
    if (entry.started_at) {
      entry.duration_seconds = Math.round(
        (new Date(entry.completed_at).getTime() -
          new Date(entry.started_at).getTime()) /
          1000,
      );
    }
    entry.artifacts_produced = artifacts;
  }

  writeAtomic(path, data);
}

export function updatePipelineError(
  projectPath: string,
  phase: string,
  message: string,
): void {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return;

  data.errors.push({
    phase,
    message,
    timestamp: new Date().toISOString(),
  });

  const entry = data.phases.find((p) => p.name === phase);
  if (entry) {
    entry.status = "error";
  }
  data.status = "blocked";

  writeAtomic(path, data);
}

export function updatePipelineBlocked(
  projectPath: string,
  phase: string,
  missingArtifacts: string[],
): void {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return;

  data.status = "blocked";
  const entry = data.phases.find((p) => p.name === phase);
  if (entry) {
    entry.status = "error";
  }
  data.errors.push({
    phase,
    message: `Missing required artifacts: ${missingArtifacts.join(", ")}`,
    timestamp: new Date().toISOString(),
  });

  writeAtomic(path, data);
}

export function updatePipelineResume(projectPath: string, phase: string): void {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return;

  data.status = "running";
  data.current_phase = phase;

  // Reset the error state on the phase entry
  const entry = data.phases.find((p) => p.name === phase);
  if (entry) {
    entry.status = "running";
    entry.started_at = new Date().toISOString();
  }

  writeAtomic(path, data);
}

export function getLastSuccessfulPhase(projectPath: string): string | null {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return null;

  // Find the last phase that completed successfully
  let lastSuccessful: string | null = null;
  for (const phase of data.phases) {
    if (phase.status === "complete") {
      lastSuccessful = phase.name;
    }
  }
  return lastSuccessful;
}

export function completePipeline(projectPath: string): void {
  const path = getProgressPath(projectPath);
  const data = readCurrent(path);
  if (!data) return;

  data.status = "complete";
  data.completed_at = new Date().toISOString();

  writeAtomic(path, data);
}
