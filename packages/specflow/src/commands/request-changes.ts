/**
 * Request Changes Command
 * Send a feature back to implement phase with feedback
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
  getDbInstance,
} from "../lib/database";
import { requestChanges } from "../lib/gate-resolver";

export interface RequestChangesCommandOptions {
  reason?: string;
}

/**
 * Execute the request-changes command
 */
export async function requestChangesCommand(
  featureId: string,
  options: RequestChangesCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  if (!options.reason) {
    console.error("Error: --reason is required for request-changes.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const feature = getFeature(featureId);

    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    const db = getDbInstance();
    const { gate, feedbackRound } = requestChanges(db, projectPath, featureId, options.reason);

    console.log(`\n[REQUEST CHANGES] ${featureId} at ${gate.phase_boundary}`);
    console.log(`  Reason: ${options.reason}`);
    console.log(`  Feature reset to: implement (in_progress)`);
    console.log(`  Feedback appended to: .specify/reviews/${featureId}/feedback.md (round ${feedbackRound})`);
    console.log("");
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
