/**
 * specflow reject <feature-id> --reason <text>
 * Reject a pending gate for a feature
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { rejectGate } from "../lib/gate-resolver";
import { writePendingApprovalFile } from "../lib/pending-approval-writer";

export function rejectCommand(featureId: string, options: { reason?: string }): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  if (!options.reason) {
    console.error("--reason is required when rejecting a gate");
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();

  const result = rejectGate(db, featureId, options.reason);
  if (!result) {
    console.error(`No pending approval gate found for ${featureId}`);
    process.exit(1);
  }

  writePendingApprovalFile(db, projectPath);
  console.log(`[GATE REJECTED] ${featureId}: ${options.reason}`);
}
