/**
 * specflow approve <feature-id>
 * Approve a pending gate for a feature
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { approveGate } from "../lib/gate-resolver";
import { writePendingApprovalFile } from "../lib/pending-approval-writer";

export function approveCommand(featureId: string): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();

  const result = approveGate(db, featureId);
  if (!result) {
    console.error(`No pending approval gate found for ${featureId}`);
    process.exit(1);
  }

  writePendingApprovalFile(db, projectPath);
  console.log(`[GATE APPROVED] ${featureId} at ${result.phase_boundary}`);
}
