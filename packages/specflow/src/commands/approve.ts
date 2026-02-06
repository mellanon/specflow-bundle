/**
 * specflow approve <feature-id>
 * Approve a pending gate for a feature
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { approveGate } from "../lib/gate-resolver";
import { writePendingApprovalFile } from "../lib/pending-approval-writer";

export function approveCommand(featureIds: string[]): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();

  let approved = 0;
  let failed = 0;

  for (const featureId of featureIds) {
    const result = approveGate(db, featureId);
    if (!result) {
      console.error(`No pending approval gate found for ${featureId}`);
      failed++;
    } else {
      console.log(`[GATE APPROVED] ${featureId} at ${result.phase_boundary}`);
      approved++;
    }
  }

  writePendingApprovalFile(db, projectPath);

  if (featureIds.length > 1) {
    console.log(`\nBatch result: ${approved} approved, ${failed} failed`);
  }

  if (failed > 0 && approved === 0) {
    process.exit(1);
  }
}
