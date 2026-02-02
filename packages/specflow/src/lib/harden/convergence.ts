/**
 * Harden Convergence Check — F-023
 * Reports convergence status without running any evaluation
 */

import { readEvaluation, readTriageOptional, writeConvergence } from "./artifacts";
import type { ConvergenceResult } from "../../types";

/**
 * Check convergence: are all test cases passing or accepted?
 */
export function checkConvergence(
  projectPath: string,
  featureId: string
): ConvergenceResult {
  const evaluation = readEvaluation(projectPath, featureId);
  const triage = readTriageOptional(projectPath, featureId);

  // Build sets from triage decisions
  const acceptedIds = new Set<string>();
  const bugIds = new Set<string>();
  const specGapIds = new Set<string>();

  if (triage) {
    for (const d of triage.decisions) {
      if (d.category === "accept") acceptedIds.add(d.testCaseId);
      else if (d.category === "bug") bugIds.add(d.testCaseId);
      else if (d.category === "spec-gap") specGapIds.add(d.testCaseId);
    }
  }

  const passCount = evaluation.testCases.filter((tc) => tc.status === "pass").length;
  const acceptedCount = acceptedIds.size;
  const bugsCount = bugIds.size;
  const specGapsCount = specGapIds.size;

  // Remaining failures: failed/skipped cases that are not accepted, not classified as bug or spec-gap
  const failedIds = evaluation.testCases
    .filter((tc) => tc.status !== "pass")
    .map((tc) => tc.id);

  const remainingFailures = failedIds.filter(
    (id) => !acceptedIds.has(id) && !bugIds.has(id) && !specGapIds.has(id)
  ).length;

  // Also count bugs and spec-gaps that are still failing as not converged
  const converged = bugsCount === 0 && specGapsCount === 0 && remainingFailures === 0;

  const result: ConvergenceResult = {
    featureId,
    checkedAt: new Date().toISOString(),
    converged,
    summary: {
      total: evaluation.summary.total,
      pass: passCount,
      accepted: acceptedCount,
      bugs: bugsCount,
      specGaps: specGapsCount,
      remainingFailures,
    },
  };

  writeConvergence(projectPath, featureId, result);

  if (converged) {
    console.log(`  CONVERGED: ${passCount + acceptedCount}/${evaluation.summary.total} pass or accepted`);
  } else {
    const issues: string[] = [];
    if (bugsCount > 0) issues.push(`${bugsCount} bugs`);
    if (specGapsCount > 0) issues.push(`${specGapsCount} spec-gaps`);
    if (remainingFailures > 0) issues.push(`${remainingFailures} unclassified failures`);
    console.log(`  NOT CONVERGED: ${issues.join(", ")} remaining`);
  }

  return result;
}
