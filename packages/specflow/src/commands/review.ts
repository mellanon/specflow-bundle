/**
 * Review Command
 * Three-layer review: automated checks → AI alignment → human template
 */

import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
} from "../lib/database";
import {
  runAutomatedChecks,
  checkFileAlignment,
  writeReviewResult,
  type AutomatedReviewResult,
} from "../lib/review/automated";
import { runAIReview, appendAIReviewToMarkdown } from "../lib/review/ai-review";
import { appendHumanReviewTemplate } from "../lib/review/human-template";

// =============================================================================
// Options
// =============================================================================

interface ReviewOptions {
  skipAi?: boolean;
  skipHuman?: boolean;
  checksOnly?: boolean;
}

// =============================================================================
// Command Handler
// =============================================================================

async function reviewCommandHandler(
  featureId: string,
  options: ReviewOptions
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
      console.error(`Error: Feature ${featureId} has no spec. Run 'specflow specify ${featureId}' first.`);
      process.exit(1);
    }

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) {
      console.error(`Error: No spec.md found at ${specFile}`);
      process.exit(1);
    }

    console.log(`\n🔍 Reviewing ${featureId}: ${feature.name}\n`);

    // =========================================================================
    // Layer 1: Automated Checks
    // =========================================================================
    console.log("━━━ Layer 1: Automated Checks ━━━\n");

    const checks = await runAutomatedChecks(projectPath);

    const specContent = readFileSync(specFile, "utf-8");
    const alignment = checkFileAlignment(specContent, projectPath);

    const automatedResult: AutomatedReviewResult = {
      reviewedAt: new Date().toISOString(),
      featureId,
      checks,
      alignment,
      passed: checks.every((c) => c.passed) && alignment.missing.length === 0,
    };

    // Print check results
    for (const check of checks) {
      const icon = check.passed ? "✓" : "✗";
      console.log(`  ${icon} ${check.name} (${check.duration}ms)`);
    }

    if (alignment.missing.length > 0) {
      console.log(`\n  ⚠ ${alignment.missing.length} file(s) referenced in spec but missing:`);
      for (const file of alignment.missing) {
        console.log(`    - ${file}`);
      }
    }

    console.log(`\n  Matched files: ${alignment.matched.length}`);

    const reviewPath = writeReviewResult(feature.specPath, automatedResult);
    console.log(`\n  📝 Review: ${reviewPath}`);

    if (options.checksOnly) {
      return;
    }

    // =========================================================================
    // Layer 2: AI Alignment Review
    // =========================================================================
    let aiResult = null;

    if (!options.skipAi) {
      console.log("\n━━━ Layer 2: AI Spec-Code Alignment ━━━\n");
      console.log("  Running AI alignment check...");

      aiResult = await runAIReview(featureId, feature.specPath, projectPath);

      const scorePercent = (aiResult.score * 100).toFixed(0);
      console.log(`\n  Score: ${scorePercent}% ${aiResult.passed ? "(PASS)" : "(FAIL)"}`);

      if (aiResult.findings.length > 0) {
        for (const finding of aiResult.findings) {
          const icon = finding.severity === "critical" ? "!!" : finding.severity === "warning" ? "!" : "i";
          console.log(`  ${icon} [${finding.area}] ${finding.description}`);
        }
      }

      appendAIReviewToMarkdown(reviewPath, aiResult);
    }

    // =========================================================================
    // Layer 3: Human Review Template
    // =========================================================================
    if (!options.skipHuman) {
      console.log("\n━━━ Layer 3: Human Review Template ━━━\n");
      appendHumanReviewTemplate(reviewPath, automatedResult, aiResult);
      console.log("  ✓ Human review template appended");
    }

    // Summary
    console.log(`\n${"─".repeat(50)}`);
    const allPassed = automatedResult.passed && (aiResult?.passed ?? true);
    console.log(`\n${allPassed ? "✓" : "✗"} Review ${allPassed ? "PASSED" : "NEEDS ATTENTION"}`);
    console.log(`📝 Full review: ${reviewPath}`);
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Command Registration
// =============================================================================

export function reviewCommand(program: Command): void {
  program
    .command("review")
    .description("Run three-layer review: automated checks, AI alignment, human template")
    .argument("<feature-id>", "Feature ID to review")
    .option("--skip-ai", "Skip AI alignment review (Layer 2)")
    .option("--skip-human", "Skip human review template (Layer 3)")
    .option("--checks-only", "Run only automated checks (Layer 1)")
    .action(reviewCommandHandler);
}
