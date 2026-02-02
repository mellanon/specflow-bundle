/**
 * Evolve Command
 * Transition a completed feature into brownfield iteration mode
 */

import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
} from "../lib/database";
import { evolveFeature } from "../lib/evolve";

export interface EvolveCommandOptions {
  dryRun?: boolean;
  json?: boolean;
  version?: string;
}

/**
 * Execute the evolve command
 */
export async function evolveCommand(
  featureId: string,
  options: EvolveCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  // Reject --version flag
  if (options.version) {
    console.error("Error: The --version flag is not supported.");
    console.error("Evolve is a one-time greenfield-to-brownfield transition that creates the initial v1.0 baseline.");
    console.error("Subsequent version tracking happens through the brownfield diff/apply cycle.");
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

    const result = evolveFeature(projectPath, feature, {
      dryRun: options.dryRun ?? false,
      json: options.json ?? false,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (options.dryRun) {
        console.log("\n[DRY RUN] Would evolve feature:\n");
      } else {
        console.log("\nFeature evolved to brownfield mode:\n");
      }
      console.log(`  Feature:       ${result.feature_id} - ${result.feature_name}`);
      console.log(`  Baseline:      ${result.baseline_path}`);
      console.log(`  Spec snapshot: ${result.spec_snapshot_path}`);
      console.log(`  Manifest:      ${result.manifest_path}`);
      console.log(`  Artifacts:     ${result.artifact_count}`);
      console.log(`  Status:        ${result.status}`);

      if (!options.dryRun) {
        console.log(`\nNext: Run 'specflow brownfield scan ${featureId}' to start iterating.`);
      }
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    closeDatabase();
  }
}
