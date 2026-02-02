/**
 * specflow pending
 * List all pending approval gates
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { listPending } from "../lib/gate-resolver";

export function pendingCommand(): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();
  const pending = listPending(db);

  if (pending.length === 0) {
    console.log("No pending approvals");
    return;
  }

  console.log(`\nPending Approvals (${pending.length}):\n`);
  console.log(
    "Feature ID".padEnd(12) +
    "Phase Boundary".padEnd(25) +
    "Urgency".padEnd(12) +
    "Triggered At".padEnd(28) +
    "Elapsed"
  );
  console.log("-".repeat(90));

  for (const gate of pending) {
    const elapsed = Math.round((Date.now() - new Date(gate.triggered_at).getTime()) / 1000);
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.round(elapsed / 60)}m`;

    console.log(
      gate.feature_id.padEnd(12) +
      gate.phase_boundary.padEnd(25) +
      gate.urgency.padEnd(12) +
      gate.triggered_at.padEnd(28) +
      elapsedStr
    );
  }
}
