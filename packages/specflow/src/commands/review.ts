/**
 * Review Command — Revised
 *
 * Runs automated checks, compiles evidence, generates review package for human.
 * No AI review, no autofix. Human reads package and approves/rejects.
 */

import { Command } from "commander";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  getDbPath,
  dbExists,
  validateSpecPathOwnership,
} from "../lib/database";
import {
  runAutomatedChecks,
  checkFileAlignment,
  writeReviewResult,
  type AutomatedReviewResult,
  type CheckResult,
} from "../lib/review/automated";
import { compileEvidence } from "../lib/review/evidence-compiler";
import {
  renderReviewPackage,
  writeReviewPackage,
} from "../lib/review/review-package-renderer";
import {
  writeReviewJson,
  readAllReviewJsons,
  generateReviewReport,
} from "../lib/review/artifacts";
import type { ReviewResult } from "../types";
import type { Feature } from "../types";

// =============================================================================
// Options
// =============================================================================

interface ReviewOptions {
  checksOnly?: boolean;
  all?: boolean;
  status?: boolean;
  report?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function assembleReviewResult(
  featureId: string,
  automatedResult: AutomatedReviewResult,
  projectPath: string,
  featureName?: string
): ReviewResult {
  const checksPass = automatedResult.passed;

  // Read harden results for acceptance test status
  const { readHardenResults } = require("../lib/harden/acceptance-spec-ingest");
  const hardenResults = readHardenResults(projectPath, featureId);

  let acceptanceTests: ReviewResult["acceptanceTests"] = null;
  let acceptanceTestsPass: boolean | null = null;

  if (hardenResults) {
    const s = hardenResults.summary;
    acceptanceTests = {
      available: true,
      total: s.total,
      pass: s.pass,
      fail: s.fail,
      skip: s.skip,
      pending: s.pending,
    };
    acceptanceTestsPass = s.total > 0 && s.fail === 0 && s.pending === 0;
  }

  const passed = checksPass && (acceptanceTestsPass === null || acceptanceTestsPass === true);

  return {
    featureId,
    featureName,
    reviewedAt: new Date().toISOString(),
    passed,
    automatedChecks: {
      passed: checksPass,
      checks: automatedResult.checks.map((c) => ({
        name: c.name,
        passed: c.passed,
        duration: c.duration,
      })),
      alignment: {
        matched: automatedResult.alignment.matched.length,
        missing: automatedResult.alignment.missing.length,
      },
    },
    acceptanceTests,
    summary: {
      checksPass,
      acceptanceTestsPass,
    },
  };
}

// =============================================================================
// Single Feature Review
// =============================================================================

async function reviewSingleFeature(
  feature: Feature,
  projectPath: string,
  options: ReviewOptions,
  sharedChecks?: CheckResult[]
): Promise<ReviewResult> {
  const featureId = feature.id;

  if (!feature.specPath) {
    throw new Error(`Feature ${featureId} has no spec.`);
  }

  const ownershipError = validateSpecPathOwnership(featureId, feature.specPath);
  if (ownershipError) {
    throw new Error(ownershipError);
  }

  const specFile = join(feature.specPath, "spec.md");
  if (!existsSync(specFile)) {
    throw new Error(`No spec.md found at ${specFile}`);
  }

  // Layer 1: Automated Checks
  const checks = sharedChecks ?? (await runAutomatedChecks(projectPath));

  const specContent = readFileSync(specFile, "utf-8");
  const alignment = checkFileAlignment(specContent, projectPath);

  const automatedResult: AutomatedReviewResult = {
    reviewedAt: new Date().toISOString(),
    featureId,
    checks,
    alignment,
    passed: checks.every((c) => c.passed) && alignment.missing.length === 0,
  };

  // Write automated review markdown
  writeReviewResult(feature.specPath, automatedResult);

  // Assemble review result
  const reviewResult = assembleReviewResult(featureId, automatedResult, projectPath, feature.name);
  writeReviewJson(projectPath, featureId, reviewResult);

  // Compile evidence and generate review package (always)
  if (!options.checksOnly) {
    const pkg = compileEvidence(
      featureId,
      feature.name,
      feature.description || "",
      automatedResult,
      projectPath
    );
    const packageContent = renderReviewPackage(pkg);
    writeReviewPackage(projectPath, featureId, packageContent);
  }

  return reviewResult;
}

// =============================================================================
// --status: Show Review Status
// =============================================================================

function showReviewStatus(projectPath: string): void {
  const results = readAllReviewJsons(projectPath);

  if (results.length === 0) {
    console.log("\n  No review artifacts found. Run 'specflow review --all' first.\n");
    return;
  }

  const sorted = results.sort((a, b) => a.featureId.localeCompare(b.featureId));

  let passCount = 0;
  let failCount = 0;

  console.log(`\n  Review Status\n`);
  console.log(
    `  ${"Feature".padEnd(10)} ${"Result".padEnd(8)} ${"Checks".padEnd(8)} ${"ATs".padEnd(10)}  Reviewed`
  );
  console.log(`  ${"─".repeat(55)}`);

  for (const r of sorted) {
    const result = r.passed ? "PASS" : "FAIL";
    const marker = r.passed ? "+" : "x";
    const checksStr = r.summary.checksPass ? "pass" : "fail";
    const at = r.acceptanceTests;
    const atStr = at && at.available
      ? `${at.pass}/${at.total}`
      : "-";
    const dateStr = r.reviewedAt.substring(0, 10);

    if (r.passed) passCount++;
    else failCount++;

    console.log(
      `  ${r.featureId.padEnd(10)} ${marker} ${result.padEnd(5)} ${checksStr.padEnd(8)} ${atStr.padEnd(10)} ${dateStr}`
    );
  }

  const total = passCount + failCount;
  console.log(`  ${"─".repeat(55)}`);
  console.log(`  Review: ${passCount}/${total} pass, ${failCount} need attention\n`);
}

// =============================================================================
// --all: Batch Review
// =============================================================================

async function reviewAll(
  projectPath: string,
  options: ReviewOptions
): Promise<void> {
  const features = getFeatures().filter(
    (f) => f.specPath && (f.phase === "implement" || f.status === "complete")
  );

  if (features.length === 0) {
    console.log("No features with specs found for review.");
    return;
  }

  console.log(`\n  Reviewing ${features.length} features...\n`);

  // Run automated checks ONCE (project-wide)
  console.log("  Running automated checks (project-wide)...");
  const sharedChecks = await runAutomatedChecks(projectPath);
  for (const check of sharedChecks) {
    const icon = check.passed ? "+" : "x";
    console.log(`    ${icon} ${check.name} (${check.duration}ms)`);
  }
  console.log("");

  let passCount = 0;
  let failCount = 0;
  const failedFeatures: string[] = [];

  for (const feature of features) {
    try {
      const result = await reviewSingleFeature(
        feature,
        projectPath,
        options,
        sharedChecks
      );

      if (result.passed) {
        passCount++;
        console.log(`  ${feature.id}  + PASS`);
      } else {
        failCount++;
        failedFeatures.push(feature.id);
        console.log(`  ${feature.id}  x FAIL`);
      }
    } catch (err: unknown) {
      failCount++;
      failedFeatures.push(feature.id);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${feature.id}  x ERROR  ${msg}`);
    }
  }

  const total = passCount + failCount;
  console.log(`\n  Review: ${passCount}/${total} pass, ${failCount} need attention`);

  // Generate consolidated report
  const reportPath = generateReviewReport(projectPath);
  console.log(`\n  Report: ${reportPath}\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// =============================================================================
// Command Handler
// =============================================================================

async function reviewCommandHandler(
  featureId: string | undefined,
  options: ReviewOptions
): Promise<void> {
  const projectPath = process.cwd();

  // --status doesn't need DB
  if (options.status) {
    showReviewStatus(projectPath);
    return;
  }

  // --report: generate report from existing artifacts, no DB needed
  if (options.report) {
    const reportPath = generateReviewReport(projectPath);
    console.log(`\n  Report generated: ${reportPath}\n`);
    return;
  }

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    if (options.all) {
      await reviewAll(projectPath, options);
      return;
    }

    // Single feature mode
    if (!featureId) {
      console.error(
        "Error: Feature ID required. Use --all for batch review or --status for status."
      );
      process.exit(1);
    }

    const feature = getFeature(featureId);
    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    if (!feature.specPath) {
      console.error(
        `Error: Feature ${featureId} has no spec. Run 'specflow specify ${featureId}' first.`
      );
      process.exit(1);
    }

    console.log(`\nReviewing ${featureId}: ${feature.name}\n`);

    // Run automated checks
    console.log("--- Automated Checks ---\n");
    const checks = await runAutomatedChecks(projectPath);
    const specFile = join(feature.specPath, "spec.md");
    const specContent = readFileSync(specFile, "utf-8");
    const alignment = checkFileAlignment(specContent, projectPath);

    const automatedResult: AutomatedReviewResult = {
      reviewedAt: new Date().toISOString(),
      featureId,
      checks,
      alignment,
      passed: checks.every((c) => c.passed) && alignment.missing.length === 0,
    };

    for (const check of checks) {
      const icon = check.passed ? "+" : "x";
      console.log(`  ${icon} ${check.name} (${check.duration}ms)`);
    }

    if (alignment.missing.length > 0) {
      console.log(
        `\n  ${alignment.missing.length} file(s) referenced in spec but missing:`
      );
      for (const file of alignment.missing) {
        console.log(`    - ${file}`);
      }
    }

    console.log(`\n  Matched files: ${alignment.matched.length}`);

    writeReviewResult(feature.specPath, automatedResult);

    // Assemble and write review.json
    const reviewResult = assembleReviewResult(
      featureId,
      automatedResult,
      projectPath,
      feature.name
    );
    writeReviewJson(projectPath, featureId, reviewResult);

    // Compile evidence and generate review package
    if (!options.checksOnly) {
      console.log("\n--- Evidence Compilation ---\n");

      const pkg = compileEvidence(
        featureId,
        feature.name,
        feature.description || "",
        automatedResult,
        projectPath
      );
      const packageContent = renderReviewPackage(pkg);
      const packagePath = writeReviewPackage(
        projectPath,
        featureId,
        packageContent
      );
      console.log(`  Review Package: ${packagePath}`);

      // Show acceptance test status if available
      if (pkg.acceptanceTests.available) {
        const s = pkg.acceptanceTests.results!.summary;
        console.log(
          `  Acceptance Tests: ${s.pass}/${s.total} pass, ${s.fail} fail`
        );
      } else {
        console.log(
          `  Acceptance Tests: not available (run 'specflow harden ${featureId}' first)`
        );
      }
    }

    // Summary
    console.log(`\n${"─".repeat(50)}`);
    const allPassed = reviewResult.passed;
    console.log(
      `\n${allPassed ? "+" : "x"} Review ${allPassed ? "PASSED" : "NEEDS ATTENTION"}`
    );
    console.log(
      `\nNext: ${allPassed ? `specflow approve ${featureId}` : `Review the package and run 'specflow approve ${featureId}' or 'specflow reject ${featureId} --reason "..."'`}`
    );

    if (!allPassed) {
      process.exit(1);
    }
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
    .description("Run automated checks, compile evidence, generate review package")
    .argument("[feature-id]", "Feature ID to review (optional with --all or --status)")
    .option("--checks-only", "Run only automated checks")
    .option("--all", "Review all features with specs")
    .option("--status", "Show review status from JSON artifacts")
    .option("--report", "Generate review report from existing artifacts")
    .action(reviewCommandHandler);
}
