/**
 * Gate Resolver
 * Operator-side approval/rejection of gates
 */

import type { Database } from "bun:sqlite";
import type { PendingApproval } from "../types";

/**
 * Approve a pending gate for a feature
 */
export function approveGate(db: Database, featureId: string): PendingApproval | null {
  const row = db.query(
    `SELECT * FROM approval_gates WHERE feature_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
  ).get(featureId) as PendingApproval | null;

  if (!row) return null;

  const now = new Date().toISOString();
  db.run(
    `UPDATE approval_gates SET status = 'approved', resolved_at = ?, resolved_by = 'operator' WHERE id = ?`,
    [now, row.id]
  );

  return { ...row, status: "approved", resolved_at: now, resolved_by: "operator" };
}

/**
 * Reject a pending gate for a feature
 */
export function rejectGate(db: Database, featureId: string, reason: string): PendingApproval | null {
  const row = db.query(
    `SELECT * FROM approval_gates WHERE feature_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
  ).get(featureId) as PendingApproval | null;

  if (!row) return null;

  const now = new Date().toISOString();
  db.run(
    `UPDATE approval_gates SET status = 'rejected', resolved_at = ?, resolved_by = 'operator', rejection_reason = ? WHERE id = ?`,
    [now, reason, row.id]
  );

  return { ...row, status: "rejected", resolved_at: now, resolved_by: "operator", rejection_reason: reason };
}

/**
 * List all pending approval gates
 */
export function listPending(db: Database): PendingApproval[] {
  return db.query(
    `SELECT * FROM approval_gates WHERE status = 'pending' ORDER BY triggered_at ASC`
  ).all() as PendingApproval[];
}

/**
 * Request changes on a feature at the implement_to_complete gate
 * Rejects the gate, resets feature to implement/in_progress, appends feedback
 */
export function requestChanges(
  db: Database,
  projectPath: string,
  featureId: string,
  reason: string
): { gate: PendingApproval; feedbackRound: number } {
  // Find pending gate
  const row = db.query(
    `SELECT * FROM approval_gates WHERE feature_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
  ).get(featureId) as PendingApproval | null;

  if (!row) {
    throw new Error(`Feature ${featureId} has no pending gate. Cannot request changes.`);
  }

  if (row.phase_boundary !== "implement_to_complete") {
    throw new Error(
      `Feature ${featureId} is pending at ${row.phase_boundary}, not implement_to_complete.`
    );
  }

  const now = new Date().toISOString();

  // Atomic transaction: reject gate + reset feature phase
  const resolvedGate = db.transaction(() => {
    // 1. Reject the gate
    db.run(
      `UPDATE approval_gates SET status = 'rejected', resolved_at = ?, resolved_by = 'operator', rejection_reason = ? WHERE id = ?`,
      [now, reason, row.id]
    );

    // 2. Reset feature phase to implement, status to in_progress
    db.run(
      `UPDATE features SET phase = 'implement', status = 'in_progress' WHERE id = ?`,
      [featureId]
    );

    return { ...row, status: "rejected" as const, resolved_at: now, resolved_by: "operator", rejection_reason: reason };
  })();

  // 3. Append feedback (filesystem, outside transaction)
  const { appendFeedback } = require("./feedback-writer") as {
    appendFeedback: (p: string, id: string, reason: string) => { round: number; filePath: string };
  };
  const { round } = appendFeedback(projectPath, featureId, reason);

  // 4. Log to execution_log (F-015) - best effort
  try {
    const { recordBlockedPhase } = require("./execution-log") as {
      recordBlockedPhase: (db: any, featureId: string, phase: string) => void;
    };
    recordBlockedPhase(db, featureId, "review-feedback");
  } catch {
    // Non-fatal
  }

  // 5. Update pending-approval.json
  try {
    const { writePendingApprovalFile } = require("./pending-approval-writer") as {
      writePendingApprovalFile: (db: any, projectPath: string) => void;
    };
    writePendingApprovalFile(db, projectPath);
  } catch {
    // Non-fatal
  }

  return { gate: resolvedGate, feedbackRound: round };
}
