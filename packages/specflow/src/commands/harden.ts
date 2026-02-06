/**
 * Harden Command
 * Generate acceptance test templates and ingest filled results.
 *
 * Revised: Interactive session removed. Human fills acceptance-test.md directly.
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
  validateSpecPathOwnership,
} from "../lib/database";
import {
  generateAcceptanceSpec,
  generateAcceptanceSpecLegacy,
  writeAcceptanceSpec,
} from "../lib/harden/acceptance-spec-generator";
import { generateWorkflowTests } from "../lib/harden/workflow-test-generator";
import {
  ingestAcceptanceTests,
  readHardenResults,
  getHardenHistory,
  getHardenProgressSummary,
} from "../lib/harden/acceptance-spec-ingest";

export interface HardenCommandOptions {
  dryRun?: boolean;
  all?: boolean;
  status?: boolean;
  ingest?: boolean;
  history?: boolean;
}

// =============================================================================
// Generate acceptance test template for a single feature
// =============================================================================

async function generateForFeature(
  featureId: string,
  feature: {
    id: string;
    name: string;
    description?: string | null;
    specPath?: string | null;
    phase: string;
  }
): Promise<void> {
  const projectPath = process.cwd();

  if (!feature.specPath) {
    console.log(`  [${featureId}] Skipped: no spec path`);
    return;
  }

  const ownershipError = validateSpecPathOwnership(featureId, feature.specPath);
  if (ownershipError) {
    console.log(`  [${featureId}] Skipped: ${ownershipError}`);
    return;
  }

  const specFile = join(feature.specPath, "spec.md");
  if (!existsSync(specFile)) {
    console.log(`  [${featureId}] Skipped: spec.md not found`);
    return;
  }

  // Generate workflow-level acceptance tests using AI
  console.log(`  [${featureId}] Generating acceptance tests...`);
  try {
    const workflowResult = await generateWorkflowTests(
      featureId,
      feature.name,
      feature.description || "",
      feature.specPath!
    );
    console.log(
      `  [${featureId}] Generated ${workflowResult.tests.length} workflow tests`
    );

    const acceptanceSpecContent = generateAcceptanceSpec(workflowResult);
    const path = writeAcceptanceSpec(projectPath, featureId, acceptanceSpecContent);
    console.log(`  [${featureId}] Acceptance Spec: ${path}`);
  } catch (err) {
    // Fallback to legacy generation if AI fails
    console.log(`  [${featureId}] AI failed, using spec-based fallback`);

    // Read spec content and generate a basic template
    const specContent = readFileSync(specFile, "utf-8");
    const workflowTests = extractBasicTests(featureId, feature.name, specContent);
    const acceptanceSpecContent = generateAcceptanceSpecLegacy(
      featureId,
      feature.name,
      workflowTests,
      simpleHash(specContent),
      feature.description || ""
    );
    const path = writeAcceptanceSpec(projectPath, featureId, acceptanceSpecContent);
    console.log(`  [${featureId}] Acceptance Spec (fallback): ${path}`);
  }
}

/**
 * Extract basic test cases from spec content when AI is unavailable
 */
function extractBasicTests(
  featureId: string,
  featureName: string,
  specContent: string
): Array<{
  id: string;
  description: string;
  source: string;
  type: string;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
}> {
  const tests: Array<{
    id: string;
    description: string;
    source: string;
    type: string;
    preconditions: string[];
    steps: string[];
    expectedResult: string;
  }> = [];

  // Extract scenarios from spec
  const scenarioMatches = specContent.matchAll(
    /### Scenario (\d+):\s*(.+)/g
  );
  let idx = 1;
  for (const match of scenarioMatches) {
    tests.push({
      id: `AT-${idx}`,
      description: `Verify: ${match[2].trim()}`,
      source: `Scenario ${match[1]}`,
      type: "manual",
      preconditions: [],
      steps: [`Execute Scenario ${match[1]} as described in spec`],
      expectedResult: `Scenario ${match[1]} passes acceptance criteria`,
    });
    idx++;
  }

  // If no scenarios found, create a single generic test
  if (tests.length === 0) {
    tests.push({
      id: "AT-1",
      description: `Verify ${featureName} works as specified`,
      source: "spec.md",
      type: "manual",
      preconditions: [],
      steps: ["Execute the feature as described in spec.md"],
      expectedResult: "Feature works as specified",
    });
  }

  return tests;
}

/**
 * Simple string hash for spec content
 */
function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// =============================================================================
// Ingest filled acceptance-test.md
// =============================================================================

function ingestForFeature(featureId: string): void {
  const projectPath = process.cwd();

  const feature = getFeature(featureId);
  if (!feature) {
    console.error(`Error: Feature ${featureId} not found.`);
    process.exit(1);
  }

  console.log(`\n  Ingesting results for ${featureId}: ${feature.name}\n`);

  const results = ingestAcceptanceTests(projectPath, featureId);
  const s = results.summary;

  console.log(`  Iteration #${results.iteration}`);
  console.log(`  Results: ${s.pass} pass, ${s.fail} fail, ${s.skip} skip, ${s.pending} pending (${s.total} total)`);

  // Show delta from previous ingest
  if (results.delta) {
    const d = results.delta;
    const parts: string[] = [];
    if (d.passChange !== 0) parts.push(`pass ${d.passChange > 0 ? "+" : ""}${d.passChange}`);
    if (d.failChange !== 0) parts.push(`fail ${d.failChange > 0 ? "+" : ""}${d.failChange}`);
    if (parts.length > 0) console.log(`  Delta: ${parts.join(", ")}`);
    if (d.fixedTests.length > 0) console.log(`  Fixed: ${d.fixedTests.join(", ")}`);
    if (d.brokenTests.length > 0) console.log(`  Broken: ${d.brokenTests.join(", ")}`);
  }

  // Phase transition based on results
  if (s.pending > 0) {
    console.log(`\n  ${s.pending} test(s) still pending. Fill in all results before ingesting.`);
  } else if (s.fail > 0) {
    updateFeaturePhase(featureId, "implement");
    console.log(`\n  ${s.fail} test(s) FAILED. Feature returned to implement phase.`);
    console.log(`  Review failures, fix, and re-test.\n`);
  } else if (s.pass > 0) {
    console.log(`\n  ALL TESTS PASSED. Feature ${featureId} eligible for completion.`);
    console.log(`  Next: Run 'specflow review ${featureId}'\n`);
  }
}

// =============================================================================
// Status display
// =============================================================================

function showHardenStatus(projectPath: string): void {
  const hardenDir = join(projectPath, ".specify", "harden");
  if (!existsSync(hardenDir)) {
    console.log(
      "  No harden data found. Run 'specflow harden --all' to generate acceptance tests."
    );
    return;
  }

  const dirs = readdirSync(hardenDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (dirs.length === 0) {
    console.log("  No harden data found.");
    return;
  }

  let totalPass = 0,
    totalFail = 0,
    totalSkip = 0,
    totalPending = 0;
  const rows: {
    id: string;
    total: number;
    pass: number;
    fail: number;
    skip: number;
    pending: number;
    source: string;
  }[] = [];

  for (const dir of dirs) {
    // Try results.json first (ingested results)
    const results = readHardenResults(projectPath, dir);
    if (results) {
      const s = results.summary;
      rows.push({
        id: dir.toUpperCase(),
        total: s.total,
        pass: s.pass,
        fail: s.fail,
        skip: s.skip,
        pending: s.pending,
        source: "results",
      });
      totalPass += s.pass;
      totalFail += s.fail;
      totalSkip += s.skip;
      totalPending += s.pending;
      continue;
    }

    // Fall back to counting from acceptance-test.md
    const atPath = join(hardenDir, dir, "acceptance-test.md");
    if (!existsSync(atPath)) continue;

    const content = readFileSync(atPath, "utf-8");
    const atCount = (content.match(/^## AT-\d+:/gm) || []).length;
    if (atCount > 0) {
      rows.push({
        id: dir.toUpperCase(),
        total: atCount,
        pass: 0,
        fail: 0,
        skip: 0,
        pending: atCount,
        source: "template",
      });
      totalPending += atCount;
    }
  }

  if (rows.length === 0) {
    console.log("  No acceptance tests found.");
    return;
  }

  const totalAll = totalPass + totalFail + totalSkip + totalPending;
  const evaluated = totalPass + totalFail + totalSkip;
  const pct = totalAll > 0 ? Math.round((evaluated * 100) / totalAll) : 0;

  console.log(`\n  Harden Status: ${pct}% evaluated (${evaluated}/${totalAll})\n`);
  console.log(
    `  ${"Feature".padEnd(10)} ${"ATs".padStart(4)} ${"Pass".padStart(5)} ${"Fail".padStart(5)} ${"Skip".padStart(5)} ${"Pend".padStart(5)}  Status`
  );
  console.log(`  ${"─".repeat(56)}`);

  for (const r of rows) {
    const status =
      r.pending === r.total
        ? "PENDING"
        : r.pending > 0
          ? "..."
          : r.fail > 0
            ? "FAIL"
            : "PASS";
    const marker =
      r.pending === r.total
        ? "⏳"
        : r.pending > 0
          ? "⏳"
          : r.fail > 0
            ? "❌"
            : "✅";
    console.log(
      `  ${r.id.padEnd(10)} ${String(r.total).padStart(4)} ${String(r.pass).padStart(5)} ${String(r.fail).padStart(5)} ${String(r.skip).padStart(5)} ${String(r.pending).padStart(5)}  ${marker} ${status}`
    );
  }

  console.log(`  ${"─".repeat(56)}`);
  console.log(
    `  ${"TOTAL".padEnd(10)} ${String(totalAll).padStart(4)} ${String(totalPass).padStart(5)} ${String(totalFail).padStart(5)} ${String(totalSkip).padStart(5)} ${String(totalPending).padStart(5)}`
  );
  console.log("");
}

// =============================================================================
// History display
// =============================================================================

function showHardenHistory(projectPath: string, featureId: string): void {
  const progress = getHardenProgressSummary(projectPath, featureId);
  if (!progress) {
    console.log(`\n  No ingest history for ${featureId}.\n`);
    return;
  }

  console.log(`\n  Harden History: ${featureId.toUpperCase()}`);
  console.log(`  Ingests: ${progress.totalIngests}  |  Trend: ${progress.trend}`);

  // Sparkline of pass rates
  const sparkChars = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const spark = progress.passRateHistory.map((rate) => {
    const idx = Math.min(Math.round((rate / 100) * 8), 8);
    return sparkChars[idx];
  }).join("");
  console.log(`  Pass rate: ${spark}  (${Math.round(progress.passRateHistory[progress.passRateHistory.length - 1] ?? 0)}%)`);

  // Per-run timeline
  const history = getHardenHistory(projectPath, featureId);
  console.log(`\n  ${"Run".padEnd(5)} ${"Date".padEnd(20)} ${"Pass".padStart(5)} ${"Fail".padStart(5)} ${"Skip".padStart(5)} ${"Pend".padStart(5)}  Delta`);
  console.log(`  ${"─".repeat(62)}`);

  for (const run of history) {
    const date = new Date(run.ingestedAt).toLocaleString("en-NZ", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const s = run.summary;
    let deltaStr = "";
    if (run.delta) {
      const parts: string[] = [];
      if (run.delta.fixedTests.length > 0) parts.push(`+${run.delta.fixedTests.length} fixed`);
      if (run.delta.brokenTests.length > 0) parts.push(`-${run.delta.brokenTests.length} broken`);
      deltaStr = parts.join(", ");
    }
    console.log(
      `  ${String(`#${run.iteration}`).padEnd(5)} ${date.padEnd(20)} ${String(s.pass).padStart(5)} ${String(s.fail).padStart(5)} ${String(s.skip).padStart(5)} ${String(s.pending).padStart(5)}  ${deltaStr}`
    );
  }
  console.log("");
}

// =============================================================================
// Main command
// =============================================================================

export async function hardenCommand(
  featureId: string,
  options: HardenCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (options.status) {
    showHardenStatus(projectPath);
    return;
  }

  if (options.history) {
    if (!featureId) {
      console.error("Error: Feature ID required for --history. Usage: specflow harden F-1 --history");
      process.exit(1);
    }
    showHardenHistory(projectPath, featureId);
    return;
  }

  if (!dbExists(projectPath)) {
    console.error(
      "Error: No SpecFlow database found. Run 'specflow init' first."
    );
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // --ingest: parse filled acceptance-test.md
    if (options.ingest) {
      if (options.all) {
        const hardenDir = join(projectPath, ".specify", "harden");
        if (existsSync(hardenDir)) {
          const dirs = readdirSync(hardenDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .sort();
          for (const dir of dirs) {
            const resultsPath = join(hardenDir, dir, "acceptance-test.md");
            if (existsSync(resultsPath)) {
              try {
                ingestForFeature(dir.toUpperCase());
              } catch (err) {
                console.log(`  [${dir.toUpperCase()}] Ingest failed: ${err}`);
              }
            }
          }
        }
      } else {
        ingestForFeature(featureId);
      }
      return;
    }

    // Generate acceptance tests
    if (options.all) {
      const features = getFeatures().filter((f) =>
        ["implement", "harden"].includes(f.phase)
      );
      if (features.length === 0) {
        console.log(
          "No features at implement or harden phase eligible for hardening."
        );
        return;
      }

      console.log(
        `\n  Generating acceptance tests for ${features.length} features...\n`
      );
      const CONCURRENCY = 5;
      const results: { id: string; success: boolean; error?: string }[] = [];

      for (let i = 0; i < features.length; i += CONCURRENCY) {
        const batch = features.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(
          batch.map(async (f) => {
            try {
              await generateForFeature(f.id, f);
              return { id: f.id, success: true };
            } catch (err) {
              return { id: f.id, success: false, error: String(err) };
            }
          })
        );

        for (const result of batchResults) {
          if (result.status === "fulfilled") {
            results.push(result.value);
          } else {
            results.push({
              id: "unknown",
              success: false,
              error: result.reason,
            });
          }
        }
      }

      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);
      console.log(`\n  ══════════════════════════════════════`);
      console.log(
        `  Batch Complete: ${succeeded}/${features.length} succeeded`
      );
      if (failed.length > 0) {
        console.log(`  Failed: ${failed.map((f) => f.id).join(", ")}`);
      }
      console.log(`  ══════════════════════════════════════\n`);
    } else {
      // Single feature
      const feature = getFeature(featureId);
      if (!feature) {
        console.error(`Error: Feature ${featureId} not found.`);
        process.exit(1);
      }

      const allowedPhases = ["implement", "harden", "complete"];
      if (!allowedPhases.includes(feature.phase)) {
        console.error(
          `Error: Feature ${featureId} must have completed TASKS phase before hardening.`
        );
        console.error(
          `Current phase: ${feature.phase}. Required: implement or later.`
        );
        process.exit(1);
      }

      console.log(`\n  Harden: ${featureId} - ${feature.name}\n`);
      await generateForFeature(featureId, feature);
      console.log(
        `\n  Acceptance test template generated. Fill it in and run 'specflow harden ${featureId} --ingest' when done.\n`
      );
    }
  } finally {
    closeDatabase();
  }
}
