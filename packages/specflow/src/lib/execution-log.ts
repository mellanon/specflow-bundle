/**
 * Execution Log CRUD
 * Phase-level audit trail for pipeline executions
 */

import type { Database } from "bun:sqlite";
import type { ExecutionLogEntry, ExecutionStatus } from "../types";

/**
 * Start a phase execution, returning the log entry ID
 * Marks any stale "running" rows for same feature+phase as "failed"
 */
export function startPhaseExecution(
  db: Database,
  featureId: string,
  phase: string,
  gitShaBefore: string | null
): number {
  const now = new Date().toISOString();

  // Mark stale running entries as failed
  db.run(
    `UPDATE execution_log SET status = 'failed', completed_at = ?, error_message = 'interrupted'
     WHERE feature_id = ? AND phase = ? AND status = 'running'`,
    [now, featureId, phase]
  );

  const result = db.run(
    `INSERT INTO execution_log (feature_id, phase, started_at, status, git_sha_before)
     VALUES (?, ?, ?, 'running', ?)`,
    [featureId, phase, now, gitShaBefore]
  );

  return Number(result.lastInsertRowid);
}

/**
 * Complete a phase execution successfully
 */
export function completePhaseExecution(
  db: Database,
  logId: number,
  gitShaAfter: string | null,
  artifactsProduced: string[] = []
): void {
  const now = new Date().toISOString();
  const row = db.query(`SELECT started_at FROM execution_log WHERE id = ?`).get(logId) as { started_at: string } | null;

  let durationSeconds: number | null = null;
  if (row) {
    durationSeconds = Math.round((new Date(now).getTime() - new Date(row.started_at).getTime()) / 1000);
  }

  db.run(
    `UPDATE execution_log SET status = 'success', completed_at = ?, duration_seconds = ?,
     git_sha_after = ?, artifacts_produced = ? WHERE id = ?`,
    [now, durationSeconds, gitShaAfter, JSON.stringify(artifactsProduced), logId]
  );
}

/**
 * Record a phase execution failure
 */
export function failPhaseExecution(
  db: Database,
  logId: number,
  errorMessage: string
): void {
  const now = new Date().toISOString();
  const row = db.query(`SELECT started_at FROM execution_log WHERE id = ?`).get(logId) as { started_at: string } | null;

  let durationSeconds: number | null = null;
  if (row) {
    durationSeconds = Math.round((new Date(now).getTime() - new Date(row.started_at).getTime()) / 1000);
  }

  db.run(
    `UPDATE execution_log SET status = 'failed', completed_at = ?, duration_seconds = ?,
     error_message = ? WHERE id = ?`,
    [now, durationSeconds, errorMessage, logId]
  );
}

/**
 * Record a skipped phase
 */
export function recordSkippedPhase(
  db: Database,
  featureId: string,
  phase: string
): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO execution_log (feature_id, phase, started_at, completed_at, duration_seconds, status)
     VALUES (?, ?, ?, ?, 0, 'skipped')`,
    [featureId, phase, now, now]
  );
}

/**
 * Record a blocked phase
 */
export function recordBlockedPhase(
  db: Database,
  featureId: string,
  phase: string
): void {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO execution_log (feature_id, phase, started_at, status)
     VALUES (?, ?, ?, 'blocked')`,
    [featureId, phase, now]
  );
}

/**
 * Get full execution log for a feature (chronological order)
 */
export function getExecutionLog(db: Database, featureId: string): ExecutionLogEntry[] {
  const rows = db.query(
    `SELECT id, feature_id, phase, started_at, completed_at, duration_seconds,
            status, git_sha_before, git_sha_after, artifacts_produced, error_message
     FROM execution_log WHERE feature_id = ? ORDER BY started_at ASC`
  ).all(featureId) as any[];

  return rows.map((r: any) => ({
    id: r.id,
    featureId: r.feature_id,
    phase: r.phase,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationSeconds: r.duration_seconds,
    status: r.status as ExecutionStatus,
    gitShaBefore: r.git_sha_before,
    gitShaAfter: r.git_sha_after,
    artifactsProduced: r.artifacts_produced ? JSON.parse(r.artifacts_produced) : null,
    errorMessage: r.error_message,
  }));
}

/**
 * Get the latest execution for a specific feature+phase
 */
export function getLastPhaseExecution(
  db: Database,
  featureId: string,
  phase: string
): ExecutionLogEntry | null {
  const r = db.query(
    `SELECT id, feature_id, phase, started_at, completed_at, duration_seconds,
            status, git_sha_before, git_sha_after, artifacts_produced, error_message
     FROM execution_log WHERE feature_id = ? AND phase = ? ORDER BY started_at DESC LIMIT 1`
  ).get(featureId, phase) as any | null;

  if (!r) return null;

  return {
    id: r.id,
    featureId: r.feature_id,
    phase: r.phase,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationSeconds: r.duration_seconds,
    status: r.status as ExecutionStatus,
    gitShaBefore: r.git_sha_before,
    gitShaAfter: r.git_sha_after,
    artifactsProduced: r.artifacts_produced ? JSON.parse(r.artifacts_produced) : null,
    errorMessage: r.error_message,
  };
}
