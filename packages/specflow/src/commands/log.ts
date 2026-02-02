/**
 * specflow log <feature-id>
 * Display execution timeline for a feature
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { getExecutionLog } from "../lib/execution-log";

export function logCommand(featureId: string, options: { json?: boolean }): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();
  const entries = getExecutionLog(db, featureId);

  if (entries.length === 0) {
    console.log(`No execution history for ${featureId}`);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nExecution Log: ${featureId}\n`);
  console.log(
    "Phase".padEnd(12) +
    "Status".padEnd(10) +
    "Started".padEnd(22) +
    "Duration".padEnd(10) +
    "Git SHA (before -> after)"
  );
  console.log("-".repeat(90));

  for (const entry of entries) {
    const started = entry.startedAt ? new Date(entry.startedAt).toLocaleString() : "—";
    const duration = entry.durationSeconds !== null ? `${entry.durationSeconds}s` : "—";
    const shaBefore = entry.gitShaBefore ? entry.gitShaBefore.substring(0, 7) : "—";
    const shaAfter = entry.gitShaAfter ? entry.gitShaAfter.substring(0, 7) : "—";

    const statusIcon = {
      running: "...",
      success: "ok",
      failed: "FAIL",
      skipped: "skip",
      blocked: "BLOCK",
    }[entry.status] || entry.status;

    console.log(
      entry.phase.padEnd(12) +
      statusIcon.padEnd(10) +
      started.padEnd(22) +
      duration.padEnd(10) +
      `${shaBefore} -> ${shaAfter}`
    );

    if (entry.errorMessage) {
      console.log(`  Error: ${entry.errorMessage}`);
    }
  }
}
