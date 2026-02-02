/**
 * specflow rollback <feature-id> --to-phase <phase> --confirm
 * Rollback a feature to a specific phase using git SHA tracking
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { getExecutionLog } from "../lib/execution-log";
import { shaExists, resetToSha, isWorkingTreeDirty } from "../lib/git";

export function rollbackCommand(
  featureId: string,
  options: { toPhase?: string; confirm?: boolean }
): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  if (!options.toPhase) {
    console.error("--to-phase is required. Specify the phase to rollback to.");
    process.exit(1);
  }

  if (!options.confirm) {
    console.error("This is a destructive operation. Pass --confirm to proceed.");
    console.error(`  specflow rollback ${featureId} --to-phase ${options.toPhase} --confirm`);
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();
  const entries = getExecutionLog(db, featureId);

  if (entries.length === 0) {
    console.error(`No execution history for ${featureId}`);
    process.exit(1);
  }

  // Find the phase AFTER the target phase to get git_sha_before
  const phaseOrder = ["specify", "plan", "tasks", "implement"];
  const targetIndex = phaseOrder.indexOf(options.toPhase);

  if (targetIndex === -1) {
    console.error(`Unknown phase: ${options.toPhase}. Valid phases: ${phaseOrder.join(", ")}`);
    process.exit(1);
  }

  // Find the execution entry for the phase after target
  const nextPhase = phaseOrder[targetIndex + 1];
  let targetSha: string | null = null;

  if (nextPhase) {
    const nextEntry = entries.find((e) => e.phase === nextPhase && e.gitShaBefore);
    if (nextEntry) {
      targetSha = nextEntry.gitShaBefore;
    }
  }

  if (!targetSha) {
    // Fallback: use git_sha_after of the target phase
    const targetEntry = entries.find((e) => e.phase === options.toPhase && e.gitShaAfter);
    if (targetEntry) {
      targetSha = targetEntry.gitShaAfter;
    }
  }

  if (!targetSha) {
    console.error(`No git SHA found for rollback to phase: ${options.toPhase}`);
    process.exit(1);
  }

  if (!shaExists(projectPath, targetSha)) {
    console.error(`Git SHA ${targetSha} no longer exists in repository`);
    process.exit(1);
  }

  if (isWorkingTreeDirty(projectPath)) {
    console.error("Working tree has uncommitted changes. Commit or stash before rollback.");
    process.exit(1);
  }

  resetToSha(projectPath, targetSha, "hard");
  console.log(`[ROLLBACK] ${featureId} rolled back to phase: ${options.toPhase}`);
  console.log(`  Git SHA: ${targetSha}`);
}
