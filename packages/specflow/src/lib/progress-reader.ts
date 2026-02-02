import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProgressFile } from "../types";

const PROGRESS_DIR = ".specify/pipeline";
const PROGRESS_FILE = "progress.json";

export function readProgressFile(projectPath: string): ProgressFile | null {
  const path = join(projectPath, PROGRESS_DIR, PROGRESS_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    console.warn(`[specflow] Malformed progress file at ${path}`);
    return null;
  }
}

export function isStale(progress: ProgressFile): boolean {
  return progress.status === "complete" || progress.status === "blocked";
}

export function getElapsedSeconds(progress: ProgressFile): number {
  const start = new Date(progress.started_at).getTime();
  const end =
    progress.status === "complete" && progress.completed_at
      ? new Date(progress.completed_at).getTime()
      : Date.now();
  return Math.round((end - start) / 1000);
}

export function formatSummaryHeader(
  progress: ProgressFile,
  stats: { total: number; complete: number; percentComplete: number },
): string {
  if (!isStale(progress)) {
    const elapsed = getElapsedSeconds(progress);
    return `In flight: ${progress.feature_id} ${progress.feature_name} (${progress.current_phase} -- ${elapsed}s elapsed)`;
  }
  if (progress.status === "blocked") {
    const lastError = progress.errors?.[progress.errors.length - 1];
    const errorMsg = lastError?.message || "unknown error";
    return `Blocked: ${progress.feature_id} ${progress.feature_name} at ${progress.current_phase} — ${errorMsg}`;
  }
  const completedAt = progress.completed_at
    ? new Date(progress.completed_at).toLocaleTimeString()
    : "unknown";
  return `Last run: ${progress.feature_id} completed at ${completedAt}`;
}

export function formatBriefLine(
  progress: ProgressFile,
  stats: { total: number; complete: number; percentComplete: number },
): string {
  const elapsed = getElapsedSeconds(progress);
  return `${progress.feature_id} ${progress.feature_name} -- ${progress.current_phase} (${elapsed}s) | ${stats.complete}/${stats.total} complete (${stats.percentComplete}%)`;
}
