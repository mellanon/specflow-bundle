/**
 * Release Command
 * Evaluates 8 sequential gates for release readiness.
 */

import { Command } from "commander";
import { join } from "path";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  getDbPath,
  dbExists,
} from "../lib/database";
import {
  evaluateReleaseGates,
  writeReleaseReport,
} from "../lib/release/gates";

// =============================================================================
// Options
// =============================================================================

interface ReleaseOptions {
  json?: boolean;
}

// =============================================================================
// Command Handler
// =============================================================================

async function releaseCommandHandler(
  featureId: string,
  options: ReleaseOptions
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
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

    if (!feature.specPath) {
      console.error(`Error: Feature ${featureId} has no spec path.`);
      process.exit(1);
    }

    const features = getFeatures();

    console.log(`\n🚀 Release Readiness Evaluation: ${featureId}\n`);
    console.log("Evaluating 8 gates sequentially...\n");

    const report = await evaluateReleaseGates(
      features,
      featureId,
      feature.specPath,
      projectPath
    );

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Print gate results
    for (const gate of report.gates) {
      const icon = gate.passed ? "✓" : "✗";
      console.log(`  ${icon} Gate ${gate.gate}: ${gate.name}`);
      console.log(`    ${gate.message}`);
      if (gate.details && !gate.passed) {
        console.log(`    ${gate.details}`);
      }
    }

    const reportPath = writeReleaseReport(projectPath, report);

    console.log(`\n${"─".repeat(50)}`);
    if (report.passed) {
      console.log("\n✓ All 8 gates passed — READY FOR RELEASE");
    } else {
      console.log(`\n✗ Stopped at Gate ${report.stoppedAtGate} — NOT READY`);
      console.log(`  Fix the issue above and re-run 'specflow release ${featureId}'`);
    }
    console.log(`\n📝 Report: ${reportPath}`);
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Command Registration
// =============================================================================

export function releaseCommand(program: Command): void {
  program
    .command("release")
    .description("Evaluate 8 release gates: completeness, quality, changelog, inventory, secrets, branch, sanitization, PR template")
    .argument("<feature-id>", "Feature ID to evaluate for release")
    .option("--json", "Output as JSON")
    .action(releaseCommandHandler);
}
