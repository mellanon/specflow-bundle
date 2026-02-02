/**
 * Pending Approval File Writer
 * Writes derived pending-approval.json for external readers (UI, observability)
 */

import { writeFileSync, mkdirSync, existsSync, renameSync } from "fs";
import { join } from "path";
import type { Database } from "bun:sqlite";
import type { PendingApprovalFile } from "../types";

/**
 * Write pending-approval.json derived from SQLite state
 * Uses temp-then-rename for atomic writes
 */
export function writePendingApprovalFile(db: Database, projectPath: string): void {
  const pipelineDir = join(projectPath, ".specify", "pipeline");
  if (!existsSync(pipelineDir)) {
    mkdirSync(pipelineDir, { recursive: true });
  }

  const rows = db.query(
    `SELECT feature_id, phase_boundary, urgency, triggered_at, timeout_at, status
     FROM approval_gates WHERE status = 'pending' ORDER BY triggered_at ASC`
  ).all() as Array<{
    feature_id: string;
    phase_boundary: string;
    urgency: string;
    triggered_at: string;
    timeout_at: string | null;
    status: string;
  }>;

  const data: PendingApprovalFile = {
    pending: rows.map((r) => ({
      feature_id: r.feature_id,
      phase_boundary: r.phase_boundary,
      urgency: r.urgency as any,
      triggered_at: r.triggered_at,
      timeout_at: r.timeout_at,
      status: r.status as any,
    })),
  };

  const filePath = join(pipelineDir, "pending-approval.json");
  const tmpPath = filePath + ".tmp";

  writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  renameSync(tmpPath, filePath);
}
