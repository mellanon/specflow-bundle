/**
 * Gate Evaluator
 * Evaluates and waits for approval gates at phase boundaries
 */

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Database } from "bun:sqlite";
import type { PhaseBoundary, GateEvalResult, PendingApproval } from "../types";
import { loadGateConfig, parseAnnotations, resolveGateUrgency } from "./gate-config";

/**
 * Write an audit log entry for gate events
 */
function auditLog(projectPath: string, event: Record<string, unknown>): void {
  try {
    const logDir = join(projectPath, ".specify", "pipeline");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, "gate-audit.log");
    appendFileSync(logPath, JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + "\n");
  } catch {
    // Audit logging must never fail the pipeline
  }
}

/**
 * Evaluate a gate at a phase boundary
 * Returns null if no gate is configured for this boundary
 */
export function evaluateGate(
  db: Database,
  projectPath: string,
  featureId: string,
  boundary: PhaseBoundary
): GateEvalResult | null {
  const config = loadGateConfig(projectPath);

  // Read spec annotations if spec exists
  let annotations = new Map<PhaseBoundary, any>();
  const specDir = join(projectPath, ".specify", "specs");
  if (existsSync(specDir)) {
    // Find the feature's spec directory
    const { readdirSync } = require("fs");
    const dirs = readdirSync(specDir) as string[];
    const featureSlug = featureId.toLowerCase();
    const specDirName = dirs.find((d: string) => d.startsWith(featureSlug));
    if (specDirName) {
      const specPath = join(specDir, specDirName, "spec.md");
      if (existsSync(specPath)) {
        const content = readFileSync(specPath, "utf-8");
        annotations = parseAnnotations(content);
      }
    }
  }

  const result = resolveGateUrgency(boundary, annotations, config);
  if (!result) return null;

  // Insert gate record into SQLite
  const now = new Date().toISOString();
  let timeoutAt: string | null = null;
  if (result.timeoutMs !== null && result.timeoutMs > 0) {
    timeoutAt = new Date(Date.now() + result.timeoutMs).toISOString();
  }

  db.run(
    `INSERT INTO approval_gates (feature_id, phase_boundary, urgency, status, triggered_at, timeout_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
    [featureId, boundary, result.urgency, now, timeoutAt]
  );

  auditLog(projectPath, {
    event: "gate_triggered",
    feature_id: featureId,
    boundary,
    urgency: result.urgency,
  });

  // For ambient, auto-approve immediately
  if (result.action === "log_and_continue") {
    console.log(`[GATE:AMBIENT] ${boundary} for ${featureId} — logged, continuing`);
    db.run(
      `UPDATE approval_gates SET status = 'auto_approved', resolved_at = ?, resolved_by = 'auto'
       WHERE feature_id = ? AND phase_boundary = ? AND status = 'pending'`,
      [now, featureId, boundary]
    );
    auditLog(projectPath, {
      event: "gate_auto_approved",
      feature_id: featureId,
      boundary,
      urgency: result.urgency,
    });
    return result;
  }

  return result;
}

/**
 * Wait for a gate to be resolved (approved/rejected/timed-out)
 * Polls SQLite every 2 seconds
 */
export async function waitForResolution(
  db: Database,
  featureId: string,
  boundary: PhaseBoundary,
  timeoutMs: number | null,
  projectPath: string
): Promise<PendingApproval> {
  const startTime = Date.now();

  while (true) {
    const row = db.query(
      `SELECT * FROM approval_gates
       WHERE feature_id = ? AND phase_boundary = ? AND status = 'pending'
       ORDER BY id DESC LIMIT 1`
    ).get(featureId, boundary) as PendingApproval | null;

    // If no pending row found, it was resolved externally
    if (!row) {
      const resolved = db.query(
        `SELECT * FROM approval_gates
         WHERE feature_id = ? AND phase_boundary = ?
         ORDER BY id DESC LIMIT 1`
      ).get(featureId, boundary) as PendingApproval;
      return resolved;
    }

    // Check timeout for review tier
    if (timeoutMs !== null && timeoutMs > 0 && (Date.now() - startTime) >= timeoutMs) {
      const now = new Date().toISOString();
      db.run(
        `UPDATE approval_gates SET status = 'auto_approved', resolved_at = ?, resolved_by = 'timeout'
         WHERE id = ?`,
        [now, row.id]
      );
      auditLog(projectPath, {
        event: "gate_timed_out",
        feature_id: featureId,
        boundary,
      });
      return { ...row, status: "auto_approved", resolved_at: now, resolved_by: "timeout" };
    }

    // Poll every 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
