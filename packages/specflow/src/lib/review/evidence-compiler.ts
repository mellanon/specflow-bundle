/**
 * Evidence Compiler — F-024 (Revised)
 *
 * Compiles all evidence sources (automated checks, harden results, file alignment)
 * into a structured ReviewPackage for human consumption.
 */

import type { CheckResult, AutomatedReviewResult } from "./automated";
import type { HardenResults } from "../harden/acceptance-spec-ingest";
import { readHardenResults } from "../harden/acceptance-spec-ingest";

// =============================================================================
// Types
// =============================================================================

export interface ReviewPackage {
  featureId: string;
  featureName: string;
  featureDescription: string;
  compiledAt: string;

  automatedChecks: {
    passed: boolean;
    checks: CheckResult[];
  };

  fileAlignment: {
    matched: string[];
    missing: string[];
  };

  acceptanceTests: {
    available: boolean;
    results: HardenResults | null;
  };

  verdict: {
    automatedPass: boolean;
    alignmentPass: boolean;
    acceptanceTestsPass: boolean | null;
    allPass: boolean;
  };
}

// =============================================================================
// Compiler
// =============================================================================

/**
 * Compile all evidence sources into a ReviewPackage
 */
export function compileEvidence(
  featureId: string,
  featureName: string,
  featureDescription: string,
  automatedResult: AutomatedReviewResult,
  projectPath: string
): ReviewPackage {
  // Read harden results if available
  const hardenResults = readHardenResults(projectPath, featureId);

  const automatedPass = automatedResult.passed;
  const alignmentPass = automatedResult.alignment.missing.length === 0;

  // Acceptance tests pass if: all tests pass, or no results available (null = not applicable)
  let acceptanceTestsPass: boolean | null = null;
  if (hardenResults) {
    const s = hardenResults.summary;
    acceptanceTestsPass =
      s.total > 0 && s.fail === 0 && s.pending === 0;
  }

  const allPass =
    automatedPass &&
    alignmentPass &&
    (acceptanceTestsPass === null || acceptanceTestsPass === true);

  return {
    featureId,
    featureName,
    featureDescription,
    compiledAt: new Date().toISOString(),
    automatedChecks: {
      passed: automatedResult.checks.every((c) => c.passed),
      checks: automatedResult.checks,
    },
    fileAlignment: {
      matched: automatedResult.alignment.matched,
      missing: automatedResult.alignment.missing,
    },
    acceptanceTests: {
      available: hardenResults !== null,
      results: hardenResults,
    },
    verdict: {
      automatedPass,
      alignmentPass,
      acceptanceTestsPass,
      allPass,
    },
  };
}
