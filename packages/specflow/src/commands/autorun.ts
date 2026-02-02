/**
 * Autorun Command
 * Full-lifecycle self-orchestration: specify -> plan -> tasks -> implement -> complete
 */

import {
  initDatabase,
  closeDatabase,
  getFeatures,
  getDbPath,
  dbExists,
} from "../lib/database";
import { runAutorun } from "../lib/autorun";
import type { AutorunOptions } from "../types";

export interface AutorunCommandOptions {
  dryRun?: boolean;
  maxFeatures?: string;
  continueOnError?: boolean;
  startFrom?: string;
  delay?: string;
}

/**
 * Execute the autorun command
 */
export async function autorunCommand(options: AutorunCommandOptions = {}): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    console.error("Run 'specflow init' to initialize a project.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // Get features ordered by priority
    const features = getFeatures();

    const autorunOpts: AutorunOptions = {
      maxFeatures: options.maxFeatures ? parseInt(options.maxFeatures, 10) : 0,
      delaySeconds: options.delay ? parseInt(options.delay, 10) : 3,
      dryRun: options.dryRun ?? false,
      continueOnError: options.continueOnError ?? false,
      startFrom: options.startFrom ?? null,
    };

    // Close DB before autorun (subprocesses will open their own connections)
    closeDatabase();

    const summary = await runAutorun(projectPath, features, autorunOpts);

    if (!options.dryRun && summary.featuresFailed > 0) {
      process.exit(1);
    }
  } catch (err) {
    closeDatabase();
    throw err;
  }
}
