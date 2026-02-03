/**
 * Harden Autorun — F-024
 * Iterative evaluate-fix-retest loop until convergence
 */

import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { runEvaluation } from "./evaluate";
import { runTriage } from "./triage";
import { generateFixDescriptors } from "./fix-gen";
import { runRetest } from "./retest";
import { checkConvergence } from "./convergence";
import { readFixesOptional, readTriageOptional, getEvaluationProgressSummary } from "./artifacts";
import type { ConvergenceResult, EvaluationResult } from "../../types";

export interface AutorunOptions {
  maxIterations: number;
  verbose?: boolean;
}

export interface AutorunResult {
  converged: boolean;
  iterations: number;
  finalEvaluation: EvaluationResult | null;
  finalConvergence: ConvergenceResult | null;
  abortReason?: string;
}

/**
 * Run the autorun loop: evaluate → triage → fix → retest → check
 * Loops until convergence or max iterations reached
 */
export async function runAutorun(
  projectPath: string,
  featureId: string,
  specPath: string,
  options: AutorunOptions
): Promise<AutorunResult> {
  const { maxIterations, verbose } = options;

  // Check protocol exists
  const protocolPath = join(projectPath, ".specify", "harden", featureId.toLowerCase(), "protocol.md");
  if (!existsSync(protocolPath)) {
    console.error(`  Error: No protocol found for ${featureId}. Run 'specflow harden --dry-run ${featureId}' first.`);
    return {
      converged: false,
      iterations: 0,
      finalEvaluation: null,
      finalConvergence: null,
      abortReason: "No protocol found",
    };
  }

  let iteration = 0;
  let converged = false;
  let lastEval: EvaluationResult | null = null;
  let lastConvergence: ConvergenceResult | null = null;

  console.log(`\n  ═══ AUTORUN: ${featureId} ═══`);
  console.log(`  Max iterations: ${maxIterations}\n`);

  while (iteration < maxIterations && !converged) {
    iteration++;
    console.log(`  ─── Iteration ${iteration}/${maxIterations} ───`);

    // Step 1: Evaluate
    console.log(`  [1/5] Evaluating...`);
    lastEval = await runEvaluation(projectPath, featureId, specPath);

    // Show delta if available
    const enriched = lastEval as EvaluationResult & { iteration?: number; delta?: { passChange: number; failChange: number } };
    if (enriched.delta) {
      const { passChange, failChange } = enriched.delta;
      const passSymbol = passChange > 0 ? `+${passChange}` : passChange < 0 ? `${passChange}` : "0";
      const failSymbol = failChange > 0 ? `+${failChange}` : failChange < 0 ? `${failChange}` : "0";
      console.log(`        ${lastEval.summary.pass}/${lastEval.summary.total} pass (Δpass: ${passSymbol}, Δfail: ${failSymbol})`);
    } else {
      console.log(`        ${lastEval.summary.pass}/${lastEval.summary.total} pass`);
    }

    // Early exit if all pass
    if (lastEval.summary.fail === 0 && lastEval.summary.skip === 0) {
      console.log(`  [✓] All tests pass!`);
      converged = true;
      lastConvergence = checkConvergence(projectPath, featureId);
      break;
    }

    // Step 2: Triage failures
    console.log(`  [2/5] Triaging ${lastEval.summary.fail} failures...`);
    const triage = runTriage(projectPath, featureId);

    // If all failures are accepted, we're converged
    if (triage.summary.bugs === 0 && triage.summary.specGaps === 0) {
      console.log(`  [✓] All failures accepted - converged`);
      converged = true;
      lastConvergence = checkConvergence(projectPath, featureId);
      break;
    }

    // Step 3: Generate fix descriptors
    console.log(`  [3/5] Generating fix descriptors...`);
    const fixes = generateFixDescriptors(projectPath, featureId);

    if (fixes.descriptors.length === 0) {
      console.log(`        No bugs to fix - checking spec-gaps...`);
      if (triage.summary.specGaps > 0) {
        console.log(`  [!] ${triage.summary.specGaps} spec-gaps require manual spec updates`);
        break;
      }
    }

    // Step 4: Apply fixes via Claude
    if (fixes.descriptors.length > 0) {
      console.log(`  [4/5] Applying ${fixes.descriptors.length} fixes via Claude...`);
      const applyResult = await applyFixes(projectPath, featureId, verbose);
      if (!applyResult.success) {
        console.log(`        Fix application failed: ${applyResult.error}`);
        // Continue anyway - the retest will show what's still broken
      } else {
        console.log(`        Fixes applied`);
      }
    } else {
      console.log(`  [4/5] No fixes to apply`);
    }

    // Step 5: Retest
    console.log(`  [5/5] Retesting...`);
    await runRetest(projectPath, featureId, specPath);

    // Check convergence
    lastConvergence = checkConvergence(projectPath, featureId);
    converged = lastConvergence.converged;

    if (converged) {
      console.log(`  [✓] CONVERGED after ${iteration} iteration(s)`);
    } else if (iteration < maxIterations) {
      console.log(`  [→] Not converged, continuing...\n`);
    }
  }

  if (!converged && iteration >= maxIterations) {
    console.log(`\n  [!] Max iterations (${maxIterations}) reached without convergence`);
  }

  // Show progress summary
  const progress = getEvaluationProgressSummary(projectPath, featureId);
  if (progress) {
    console.log(`\n  ─── Progress Summary ───`);
    console.log(`  Total runs: ${progress.totalRuns}`);
    console.log(`  Trend: ${progress.trend}`);
    if (progress.firstRun && progress.latestRun) {
      const improvement = progress.latestRun.pass - progress.firstRun.pass;
      console.log(`  Pass improvement: ${progress.firstRun.pass} → ${progress.latestRun.pass} (${improvement >= 0 ? "+" : ""}${improvement})`);
    }
  }

  console.log(`\n  ═══ AUTORUN COMPLETE ═══\n`);

  return {
    converged,
    iterations: iteration,
    finalEvaluation: lastEval,
    finalConvergence: lastConvergence,
  };
}

/**
 * Apply fixes by calling Claude with the fix descriptors
 */
async function applyFixes(
  projectPath: string,
  featureId: string,
  verbose?: boolean
): Promise<{ success: boolean; error?: string }> {
  const fixes = readFixesOptional(projectPath, featureId);
  const triage = readTriageOptional(projectPath, featureId);

  if (!fixes || fixes.descriptors.length === 0) {
    return { success: true };
  }

  // Build a prompt for Claude to apply the fixes
  const fixDescriptions = fixes.descriptors.map((f) => {
    const triageEntry = triage?.decisions.find((d) => d.testCaseId === f.testCaseId);
    return `
## Fix for ${f.testCaseId}
- **File:** ${f.filePath}
- **Problem:** ${f.description}
- **Suggested Change:** ${f.suggestedChange}
${triageEntry?.reasoning ? `- **Triage Reasoning:** ${triageEntry.reasoning}` : ""}
`;
  }).join("\n");

  const prompt = `You are fixing bugs identified during acceptance testing.

Apply ONLY the following fixes. Do not make any other changes.

${fixDescriptions}

For each fix:
1. Read the target file
2. Make the minimal change described
3. Verify the change compiles/parses

Do not add tests. Do not refactor. Do not add comments. Just apply the fixes.

After applying all fixes, output: FIXES_APPLIED`;

  if (verbose) {
    console.log(`        Prompt length: ${prompt.length} chars`);
  }

  const result = spawnSync("claude", ["-p", prompt, "--output-format", "json"], {
    cwd: projectPath,
    timeout: 300000, // 5 minutes for fix application
    encoding: "utf-8",
    env: { ...process.env },
  });

  if (result.error) {
    return { success: false, error: result.error.message };
  }

  if (result.status !== 0) {
    return { success: false, error: `Claude exited with status ${result.status}` };
  }

  // Check if Claude indicated success
  const output = result.stdout || "";
  if (output.includes("FIXES_APPLIED")) {
    return { success: true };
  }

  // Even if the marker isn't present, consider it success if no error
  return { success: true };
}
