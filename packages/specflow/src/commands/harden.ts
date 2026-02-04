/**
 * Harden Command
 * Guided acceptance testing protocol
 */

import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getFeatures,
  updateFeaturePhase,
  getDbPath,
  dbExists,
  getDbInstance,
  validateSpecPathOwnership,
} from "../lib/database";
import { parseSpec } from "../lib/harden/spec-parser";
import { writeProtocol, computeSpecHash } from "../lib/harden/protocol-writer";
import { writeReport } from "../lib/harden/report-writer";
import { createSession, findIncompleteSession, runInteractiveSession } from "../lib/harden/harden-session";
import { generateAcceptanceSpec, writeAcceptanceSpec } from "../lib/harden/acceptance-spec-generator";
import type { HardenSession } from "../types";

export interface HardenCommandOptions {
  dryRun?: boolean;
  all?: boolean;
  status?: boolean;
  only?: string;      // Comma-separated TC IDs to run
  from?: string;      // Resume from specific TC ID
}

/**
 * Execute the harden command for a single feature
 */
async function hardenSingleFeature(
  featureId: string,
  options: HardenCommandOptions
): Promise<void> {
  const projectPath = process.cwd();
  const db = getDbInstance();
  const feature = getFeature(featureId);

  if (!feature) {
    console.error(`Error: Feature ${featureId} not found.`);
    process.exit(1);
  }

  // Phase gate: must have completed TASKS phase (FR-11), so feature must be at implement or later
  const allowedPhases = ["implement", "harden", "complete"];
  if (!allowedPhases.includes(feature.phase)) {
    console.error(`Error: Feature ${featureId} must have completed TASKS phase before hardening.`);
    console.error(`Current phase: ${feature.phase}. Required: implement or later.`);
    process.exit(1);
  }

  if (!feature.specPath) {
    console.error(`Error: Feature ${featureId} has no spec path.`);
    process.exit(1);
  }

  // Guard: verify specPath belongs to this feature (catches cross-wired DB entries)
  const ownershipError = validateSpecPathOwnership(featureId, feature.specPath);
  if (ownershipError) {
    console.error(`Error: ${ownershipError}`);
    process.exit(1);
  }

  const specFile = join(feature.specPath, "spec.md");
  if (!existsSync(specFile)) {
    console.error(`Error: spec.md not found at ${specFile}`);
    process.exit(1);
  }

  const outputDir = join(projectPath, ".specify", "harden", featureId.toLowerCase());

  console.log(`\n  Harden: ${featureId} - ${feature.name}\n`);

  // Check for existing incomplete session
  const existing = findIncompleteSession(db, featureId);
  if (existing && !options.dryRun) {
    console.log(`  Found incomplete session (${existing.resumeFrom}/${existing.testCases.length} tests remaining).`);
    console.log(`  Resuming from ${existing.testCases[existing.resumeFrom]?.id || "end"}...\n`);

    const session = await runInteractiveSession(
      db, existing.session, existing.testCases, existing.resumeFrom, outputDir, feature.name,
      { only: options.only?.split(","), from: options.from }
    );

    if (session.result !== "incomplete") {
      const reportPath = writeReport(outputDir, featureId, feature.name, session, existing.testCases, projectPath);
      console.log(`\n  Report: ${reportPath}`);
      handleResult(featureId, session);
    }
    return;
  }

  // Parse spec and generate protocol
  console.log("  Parsing spec.md for test criteria...");
  const testCases = parseSpec(specFile);

  if (testCases.length === 0) {
    console.log("  No testable criteria found in spec.md.");
    return;
  }

  console.log(`  Found ${testCases.length} test cases.`);

  const specHash = computeSpecHash(specFile);
  const protocolPath = writeProtocol(outputDir, featureId, feature.name, testCases, specHash);
  console.log(`  Protocol: ${protocolPath}`);

  if (options.dryRun) {
    // Generate human-readable acceptance test specification
    const acceptanceSpecContent = generateAcceptanceSpec(
      featureId,
      feature.name,
      testCases,
      specHash
    );
    const acceptanceSpecPath = writeAcceptanceSpec(projectPath, featureId, acceptanceSpecContent);
    console.log(`  Acceptance Spec: ${acceptanceSpecPath}`);
    console.log("\n  [DRY RUN] Acceptance test specification generated.");
    console.log("  Open the markdown file and work through each test case.\n");
    return;
  }

  // Create session and run interactive loop
  const session = createSession(db, featureId, testCases, protocolPath);
  const finalSession = await runInteractiveSession(
    db, session, testCases, 0, outputDir, feature.name,
    { only: options.only?.split(","), from: options.from }
  );

  if (finalSession.result !== "incomplete") {
    const reportPath = writeReport(outputDir, featureId, feature.name, finalSession, testCases, projectPath);
    console.log(`\n  Report: ${reportPath}`);
    handleResult(featureId, finalSession);
  }
}

/**
 * Handle harden result: advance or return phase
 */
function handleResult(featureId: string, session: HardenSession): void {
  if (session.result === "pass") {
    console.log(`\n  ALL TESTS PASSED. Feature ${featureId} eligible for completion.`);
    console.log(`  Next: Run 'specflow complete ${featureId}'\n`);
  } else if (session.result === "fail") {
    updateFeaturePhase(featureId, "implement");
    console.log(`\n  ${session.failed} TEST(S) FAILED. Feature ${featureId} returned to implement phase.`);
    console.log(`  Review the harden report and address failures.\n`);
  }
}

/**
 * Display hardening status across all features with protocols
 */
function showHardenStatus(projectPath: string): void {
  const hardenDir = join(projectPath, ".specify", "harden");
  if (!existsSync(hardenDir)) {
    console.log("  No harden protocols found. Run 'specflow harden --dry-run --all' to generate.");
    return;
  }

  const dirs = readdirSync(hardenDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (dirs.length === 0) {
    console.log("  No harden protocols found.");
    return;
  }

  let totalPass = 0, totalFail = 0, totalSkip = 0, totalPending = 0;
  const rows: { id: string; total: number; pass: number; fail: number; skip: number; pending: number }[] = [];

  for (const dir of dirs) {
    const protocolPath = join(hardenDir, dir, "protocol.md");
    if (!existsSync(protocolPath)) continue;

    const content = readFileSync(protocolPath, "utf-8");
    const pass = (content.match(/\*\*Status:\*\* pass/g) || []).length;
    const fail = (content.match(/\*\*Status:\*\* fail/g) || []).length;
    const skip = (content.match(/\*\*Status:\*\* skipped/g) || []).length;
    const pending = (content.match(/\*\*Status:\*\* pending/g) || []).length;
    const total = pass + fail + skip + pending;

    rows.push({ id: dir.toUpperCase(), total, pass, fail, skip, pending });
    totalPass += pass;
    totalFail += fail;
    totalSkip += skip;
    totalPending += pending;
  }

  const totalAll = totalPass + totalFail + totalSkip + totalPending;
  const evaluated = totalPass + totalFail + totalSkip;
  const pct = totalAll > 0 ? Math.round((evaluated * 100) / totalAll) : 0;

  console.log(`\n  Harden Status: ${pct}% evaluated (${evaluated}/${totalAll})\n`);
  console.log(`  ${"Feature".padEnd(10)} ${"Tests".padStart(5)} ${"Pass".padStart(5)} ${"Fail".padStart(5)} ${"Skip".padStart(5)} ${"Pend".padStart(5)}  Status`);
  console.log(`  ${"─".repeat(56)}`);

  for (const r of rows) {
    const status = r.pending > 0 ? "..." : r.fail > 0 ? "FAIL" : "PASS";
    const marker = r.pending > 0 ? "⏳" : r.fail > 0 ? "❌" : "✅";
    console.log(
      `  ${r.id.padEnd(10)} ${String(r.total).padStart(5)} ${String(r.pass).padStart(5)} ${String(r.fail).padStart(5)} ${String(r.skip).padStart(5)} ${String(r.pending).padStart(5)}  ${marker} ${status}`
    );
  }

  console.log(`  ${"─".repeat(56)}`);
  console.log(
    `  ${"TOTAL".padEnd(10)} ${String(totalAll).padStart(5)} ${String(totalPass).padStart(5)} ${String(totalFail).padStart(5)} ${String(totalSkip).padStart(5)} ${String(totalPending).padStart(5)}`
  );
  console.log("");
}

/**
 * Main harden command
 */
export async function hardenCommand(
  featureId: string,
  options: HardenCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (options.status) {
    showHardenStatus(projectPath);
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
      const features = getFeatures().filter((f) => ["implement", "harden"].includes(f.phase));
      if (features.length === 0) {
        console.log("No features at implement or harden phase eligible for hardening.");
        return;
      }
      for (const f of features) {
        await hardenSingleFeature(f.id, options);
      }
    } else {
      await hardenSingleFeature(featureId, options);
    }
  } finally {
    closeDatabase();
  }
}
