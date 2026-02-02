/**
 * Failure Writer
 * Writes pipeline failure state to both SQLite and derived failure.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join, dirname } from "path";
import type { PipelineFailure, FailureFile } from "../types";

const FAILURE_PATH = ".specify/pipeline/failure.json";
const MAX_HISTORY = 100;

/**
 * Write failure to derived failure.json (atomic write)
 */
export function writeFailure(projectPath: string, failure: PipelineFailure): void {
  const filePath = join(projectPath, FAILURE_PATH);
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: FailureFile = { latest: null, history: [] };
  if (existsSync(filePath)) {
    try {
      existing = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      // Corrupted file, start fresh
    }
  }

  // Prepend to history, cap at MAX_HISTORY
  existing.history.unshift(failure);
  if (existing.history.length > MAX_HISTORY) {
    existing.history = existing.history.slice(0, MAX_HISTORY);
  }
  existing.latest = failure;

  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(existing, null, 2));
  renameSync(tmp, filePath);
}

/**
 * Read failure.json
 */
export function readFailure(projectPath: string): FailureFile | null {
  const filePath = join(projectPath, FAILURE_PATH);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Record failure to SQLite pipeline_failures table
 */
export function recordFailureToDb(db: any, failure: PipelineFailure): void {
  // Check for existing unresolved failure for this feature
  const existing = db.query(
    `SELECT id, resume_count FROM pipeline_failures WHERE feature_id = ? AND resolved_at IS NULL ORDER BY id DESC LIMIT 1`
  ).get(failure.feature_id) as { id: number; resume_count: number } | null;

  if (existing) {
    // Update existing unresolved failure
    db.run(
      `UPDATE pipeline_failures SET phase = ?, missing_artifacts = ?, error_message = ?,
       last_successful_phase = ?, resume_count = resume_count + 1, blocked_at = ? WHERE id = ?`,
      [failure.phase, JSON.stringify(failure.missing_artifacts), failure.error_message || null,
       failure.last_successful_phase, failure.blocked_at, existing.id]
    );
  } else {
    db.run(
      `INSERT INTO pipeline_failures (feature_id, phase, missing_artifacts, error_message, last_successful_phase, resume_count, blocked_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [failure.feature_id, failure.phase, JSON.stringify(failure.missing_artifacts),
       failure.error_message || null, failure.last_successful_phase, failure.blocked_at]
    );
  }
}

/**
 * Resolve failure in SQLite
 */
export function resolveFailureInDb(db: any, featureId: string): void {
  const now = new Date().toISOString();
  db.run(
    `UPDATE pipeline_failures SET resolved_at = ? WHERE feature_id = ? AND resolved_at IS NULL`,
    [now, featureId]
  );
}

/**
 * Get all unresolved failures
 */
export function getUnresolvedFailures(db: any): PipelineFailure[] {
  const rows = db.query(
    `SELECT feature_id, phase, missing_artifacts, error_message, last_successful_phase, resume_count, blocked_at
     FROM pipeline_failures WHERE resolved_at IS NULL ORDER BY blocked_at DESC`
  ).all() as any[];

  return rows.map((r: any) => ({
    feature_id: r.feature_id,
    phase: r.phase,
    missing_artifacts: JSON.parse(r.missing_artifacts),
    error_message: r.error_message,
    last_successful_phase: r.last_successful_phase,
    resume_count: r.resume_count,
    blocked_at: r.blocked_at,
  }));
}
