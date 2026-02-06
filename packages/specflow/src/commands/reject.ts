/**
 * specflow reject <feature-id> --reason <text>
 * Reject a pending gate for a feature
 *
 * Standard decision codes (free text also accepted):
 *   INCOMPLETE   — Missing acceptance tests or artifacts
 *   QUALITY      — Code quality issues
 *   SPEC_DRIFT   — Implementation doesn't match spec
 *   REGRESSION   — Broke existing functionality
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { rejectGate } from "../lib/gate-resolver";
import { writePendingApprovalFile } from "../lib/pending-approval-writer";

const DECISION_CODES: Record<string, string> = {
  INCOMPLETE: "Missing acceptance tests or required artifacts",
  QUALITY: "Code quality issues identified in review",
  SPEC_DRIFT: "Implementation does not match specification",
  REGRESSION: "Broke existing functionality",
};

export function rejectCommand(featureId: string, options: { reason?: string }): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  if (!options.reason) {
    console.error("--reason is required when rejecting a gate");
    console.error("\nStandard decision codes:");
    for (const [code, desc] of Object.entries(DECISION_CODES)) {
      console.error(`  ${code.padEnd(14)} ${desc}`);
    }
    console.error("\nFree text is also accepted.");
    process.exit(1);
  }

  // Expand decision code to full description if matched
  const upperReason = options.reason.toUpperCase();
  const expandedReason = DECISION_CODES[upperReason]
    ? `[${upperReason}] ${DECISION_CODES[upperReason]}`
    : options.reason;

  initDatabase(dbPath);
  const db = getDbInstance();

  const result = rejectGate(db, featureId, expandedReason);
  if (!result) {
    console.error(`No pending approval gate found for ${featureId}`);
    process.exit(1);
  }

  writePendingApprovalFile(db, projectPath);
  console.log(`[GATE REJECTED] ${featureId}: ${expandedReason}`);
}
