/**
 * Review Command — F-024
 * Three-layer review: automated checks -> AI alignment -> human template
 * Supports --all (batch), --status (artifact display), and JSON artifact output.
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
import { runAIReview, appendAIReviewToMarkdown } from "../lib/review/ai-review";
import type { AIReviewResult } from "../lib/review/ai-review";
import { appendHumanReviewTemplate } from "../lib/review/human-template";
import { writeReviewJson, readAllReviewJsons, generateReviewReport } from "../lib/review/artifacts";
import { attemptAutofix } from "../lib/review/autofix";
import type { AutofixResult } from "../lib/review/autofix";
import type { ReviewResult } from "../types";
import type { Feature } from "../types";

// =============================================================================
// Options
// =============================================================================

interface ReviewOptions {
  skipAi?: boolean;
  skipHuman?: boolean;
  checksOnly?: boolean;
  all?: boolean;
  status?: boolean;
  autofix?: boolean;
  report?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function countFindings(findings: { severity: string }[]): { critical: number; warning: number; info: number } {
  let critical = 0, warning = 0, info = 0;
  for (const f of findings) {
    if (f.severity === "critical") critical++;
    else if (f.severity === "warning") warning++;
    else info++;
  }
  return { critical, warning, info };
}

function assembleReviewResult(
  featureId: string,
  automatedResult: AutomatedReviewResult,
  aiResult: AIReviewResult | null,
  featureName?: string
): ReviewResult {
  const checksPass = automatedResult.passed;
  const aiPass = aiResult ? aiResult.passed : null;
  const score = aiResult ? aiResult.score : null;
  const findings = aiResult?.findings ?? [];
  const passed = checksPass && (aiPass ?? true);

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
    aiReview: aiResult
      ? {
          passed: aiResult.passed,
          score: aiResult.score,
          findings: aiResult.findings.map((f) => ({
            severity: f.severity,
            area: f.area,
            description: f.description,
          })),
        }
      : null,
    summary: {
      checksPass,
      aiPass,
      score,
      findingsCount: countFindings(findings),
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

  // Guard: verify specPath belongs to this feature (catches cross-wired DB entries)
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

  // Write markdown review (existing behavior)
  const reviewPath = writeReviewResult(feature.specPath, automatedResult);

  // Layer 2: AI Alignment Review
  let aiResult: AIReviewResult | null = null;

  if (!options.skipAi && !options.checksOnly) {
    aiResult = await runAIReview(featureId, feature.specPath, projectPath);
    appendAIReviewToMarkdown(reviewPath, aiResult);
  }

  // Assemble and write review.json
  let reviewResult = assembleReviewResult(featureId, automatedResult, aiResult, feature.name);
  writeReviewJson(projectPath, featureId, reviewResult);

  // Autofix attempt — between Layer 2 (AI) and Layer 3 (human)
  if (options.autofix && !reviewResult.passed) {
    const autofixResult = await attemptAutofix(
      featureId,
      feature.specPath,
      projectPath,
      aiResult?.findings ?? [],
      { missing: automatedResult.alignment.missing.slice() }
    );

    // Store autofix result in review artifact for human visibility
    reviewResult.autofix = {
      attempted: autofixResult.attempted,
      fixed: autofixResult.fixed,
      changes: autofixResult.changes,
      error: autofixResult.error,
    };

    if (autofixResult.fixed) {
      // Re-run checks and AI review after fix
      const reChecks = sharedChecks ?? (await runAutomatedChecks(projectPath));
      const reSpecContent = readFileSync(join(feature.specPath, "spec.md"), "utf-8");
      const reAlignment = checkFileAlignment(reSpecContent, projectPath);
      const reAutomated: AutomatedReviewResult = {
        reviewedAt: new Date().toISOString(),
        featureId,
        checks: reChecks,
        alignment: reAlignment,
        passed: reChecks.every((c) => c.passed) && reAlignment.missing.length === 0,
      };

      let reAiResult: AIReviewResult | null = null;
      if (!options.skipAi && !options.checksOnly) {
        reAiResult = await runAIReview(featureId, feature.specPath, projectPath);
      }

      reviewResult = assembleReviewResult(featureId, reAutomated, reAiResult, feature.name);
      reviewResult.autofix = {
        attempted: autofixResult.attempted,
        fixed: autofixResult.fixed,
        changes: autofixResult.changes,
        error: autofixResult.error,
      };
    }

    writeReviewJson(projectPath, featureId, reviewResult);
  }

  // Layer 3: Human Review Template — HITL by exception: only for failures
  if (!options.skipHuman && !options.checksOnly && !reviewResult.passed) {
    appendHumanReviewTemplate(reviewPath, automatedResult, aiResult);
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
  console.log(`  ${"Feature".padEnd(10)} ${"Result".padEnd(8)} ${"Score".padEnd(7)} ${"Crit".padStart(4)} ${"Warn".padStart(4)} ${"Info".padStart(4)}  Reviewed`);
  console.log(`  ${"─".repeat(60)}`);

  for (const r of sorted) {
    const result = r.passed ? "PASS" : "FAIL";
    const marker = r.passed ? "+" : "x";
    const scoreStr = r.summary.score !== null ? `${(r.summary.score * 100).toFixed(0)}%` : "  -";
    const fc = r.summary.findingsCount;
    const dateStr = r.reviewedAt.substring(0, 10);

    if (r.passed) passCount++;
    else failCount++;

    console.log(
      `  ${r.featureId.padEnd(10)} ${marker} ${result.padEnd(5)} ${scoreStr.padStart(5)}  ${String(fc.critical).padStart(4)} ${String(fc.warning).padStart(4)} ${String(fc.info).padStart(4)}  ${dateStr}`
    );
  }

  const total = passCount + failCount;
  console.log(`  ${"─".repeat(60)}`);
  console.log(`  Review: ${passCount}/${total} pass, ${failCount} need attention\n`);
}

// =============================================================================
// --all: Batch Review
// =============================================================================

async function reviewAll(projectPath: string, options: ReviewOptions): Promise<void> {
  const features = getFeatures().filter((f) => f.specPath && (f.phase === "implement" || f.status === "complete"));

  if (features.length === 0) {
    console.log("No features with specs found for review.");
    return;
  }

  console.log(`\n  Reviewing ${features.length} features...\n`);

  // Layer 1: Run automated checks ONCE (project-wide)
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

  // Per-feature: Layer 1 alignment + Layer 2 AI
  for (const feature of features) {
    try {
      const result = await reviewSingleFeature(feature, projectPath, options, sharedChecks);

      const scoreStr = result.summary.score !== null
        ? `score: ${(result.summary.score * 100).toFixed(0)}%`
        : "";
      const fc = result.summary.findingsCount;
      const critStr = fc.critical > 0 ? `(${fc.critical} critical)` : "";

      if (result.passed) {
        passCount++;
        console.log(`  ${feature.id}  + PASS  ${scoreStr}`);
      } else {
        failCount++;
        failedFeatures.push(feature.id);
        console.log(`  ${feature.id}  x FAIL  ${scoreStr}  ${critStr}`);
      }
    } catch (err: unknown) {
      failCount++;
      failedFeatures.push(feature.id);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${feature.id}  x ERROR  ${msg}`);
    }
  }

  // HITL by exception: human template only for failures
  if (!options.skipHuman && failedFeatures.length > 0) {
    console.log(`\n  Human review templates appended for ${failedFeatures.length} failed feature(s).`);
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

    // Single feature mode — featureId required
    if (!featureId) {
      console.error("Error: Feature ID required. Use --all for batch review or --status for status.");
      process.exit(1);
    }

    const feature = getFeature(featureId);
    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    if (!feature.specPath) {
      console.error(`Error: Feature ${featureId} has no spec. Run 'specflow specify ${featureId}' first.`);
      process.exit(1);
    }

    console.log(`\nReviewing ${featureId}: ${feature.name}\n`);

    // Layer 1
    console.log("--- Layer 1: Automated Checks ---\n");
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
      console.log(`\n  ${alignment.missing.length} file(s) referenced in spec but missing:`);
      for (const file of alignment.missing) {
        console.log(`    - ${file}`);
      }
    }

    console.log(`\n  Matched files: ${alignment.matched.length}`);

    const reviewPath = writeReviewResult(feature.specPath, automatedResult);
    console.log(`\n  Review: ${reviewPath}`);

    if (options.checksOnly) {
      // Still write review.json for checks-only
      const result = assembleReviewResult(featureId, automatedResult, null, feature.name);
      writeReviewJson(projectPath, featureId, result);
      return;
    }

    // Layer 2
    let aiResult: AIReviewResult | null = null;

    if (!options.skipAi) {
      console.log("\n--- Layer 2: AI Spec-Code Alignment ---\n");
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

    // Write review.json
    let reviewResult = assembleReviewResult(featureId, automatedResult, aiResult, feature.name);
    writeReviewJson(projectPath, featureId, reviewResult);

    // Autofix attempt — between Layer 2 and Layer 3
    if (options.autofix && !reviewResult.passed) {
      console.log("\n--- Autofix: Attempting AI-driven fixes ---\n");

      const autofixResult = await attemptAutofix(
        featureId,
        feature.specPath,
        projectPath,
        aiResult?.findings ?? [],
        { missing: alignment.missing.slice() }
      );

      if (autofixResult.attempted) {
        if (autofixResult.fixed) {
          console.log(`  + Autofix applied ${autofixResult.changes.length} change(s):`);
          for (const c of autofixResult.changes) {
            console.log(`    - ${c.file}: ${c.description}`);
          }

          // Re-run review
          console.log("\n  Re-running review after autofix...\n");
          const reChecks = await runAutomatedChecks(projectPath);
          const reSpecContent = readFileSync(specFile, "utf-8");
          const reAlignment = checkFileAlignment(reSpecContent, projectPath);
          const reAutomated: AutomatedReviewResult = {
            reviewedAt: new Date().toISOString(),
            featureId,
            checks: reChecks,
            alignment: reAlignment,
            passed: reChecks.every((c) => c.passed) && reAlignment.missing.length === 0,
          };

          let reAiResult: AIReviewResult | null = null;
          if (!options.skipAi) {
            reAiResult = await runAIReview(featureId, feature.specPath, projectPath);
            const reScore = (reAiResult.score * 100).toFixed(0);
            console.log(`  Re-review score: ${reScore}% ${reAiResult.passed ? "(PASS)" : "(FAIL)"}`);
          }

          reviewResult = assembleReviewResult(featureId, reAutomated, reAiResult, feature.name);
          writeReviewJson(projectPath, featureId, reviewResult);
        } else if (autofixResult.error) {
          console.log(`  x Autofix failed: ${autofixResult.error}`);
        } else {
          console.log("  - Autofix made no changes");
        }
      } else {
        console.log("  - No actionable findings for autofix");
      }
    }

    // Layer 3 — HITL by exception: only for failures
    if (!options.skipHuman && !reviewResult.passed) {
      console.log("\n--- Layer 3: Human Review Template ---\n");
      appendHumanReviewTemplate(reviewPath, automatedResult, aiResult);
      console.log("  + Human review template appended (review failed)");
    }

    // Summary
    console.log(`\n${"─".repeat(50)}`);
    const allPassed = reviewResult.passed;
    console.log(`\n${allPassed ? "+" : "x"} Review ${allPassed ? "PASSED" : "NEEDS ATTENTION"}`);
    console.log(`Review: ${reviewPath}`);

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
    .description("Run three-layer review: automated checks, AI alignment, human template")
    .argument("[feature-id]", "Feature ID to review (optional with --all or --status)")
    .option("--skip-ai", "Skip AI alignment review (Layer 2)")
    .option("--skip-human", "Skip human review template (Layer 3)")
    .option("--checks-only", "Run only automated checks (Layer 1)")
    .option("--all", "Review all features with specs")
    .option("--status", "Show review status from JSON artifacts")
    .option("--autofix", "Attempt AI-driven fixes for failed reviews")
    .option("--report", "Generate review report from existing artifacts")
    .action(reviewCommandHandler);
}
