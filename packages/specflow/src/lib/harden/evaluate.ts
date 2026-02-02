/**
 * Harden Evaluate — F-023
 * Runs headless evaluation against existing test protocol
 */

import { join } from "path";
import { existsSync } from "fs";
import { readProtocol, computeSpecHash } from "./protocol-writer";
import { evaluateTestCase } from "./headless-evaluator";
import { writeEvaluation } from "./artifacts";
import type { EvaluationResult, EvaluationTestCase } from "../../types";

/**
 * Run evaluation for a single feature
 */
export function runEvaluation(
  projectPath: string,
  featureId: string,
  specPath: string
): EvaluationResult {
  const hardenDir = join(projectPath, ".specify", "harden", featureId.toLowerCase());
  const protocolPath = join(hardenDir, "protocol.md");

  if (!existsSync(protocolPath)) {
    throw new Error(
      `Protocol not found at ${protocolPath}. Run 'specflow harden --dry-run ${featureId}' first.`
    );
  }

  const testCases = readProtocol(protocolPath);
  if (testCases.length === 0) {
    throw new Error(`No test cases found in protocol at ${protocolPath}.`);
  }

  // Compute protocol hash for staleness detection
  const specFile = join(specPath, "spec.md");
  const protocolHash = existsSync(specFile) ? computeSpecHash(specFile) : "unknown";

  const evaluatedCases: EvaluationTestCase[] = [];

  for (const tc of testCases) {
    const verdict = evaluateTestCase(projectPath, featureId, specPath, tc);
    evaluatedCases.push({
      id: tc.id,
      status: verdict.status,
      evidence: verdict.evidence,
      notes: verdict.notes,
    });
  }

  const summary = {
    total: evaluatedCases.length,
    pass: evaluatedCases.filter((c) => c.status === "pass").length,
    fail: evaluatedCases.filter((c) => c.status === "fail").length,
    skip: evaluatedCases.filter((c) => c.status === "skip").length,
  };

  const result: EvaluationResult = {
    featureId,
    evaluatedAt: new Date().toISOString(),
    protocolHash,
    testCases: evaluatedCases,
    summary,
  };

  writeEvaluation(projectPath, featureId, result);

  console.log(`  ${summary.pass} pass, ${summary.fail} fail, ${summary.skip} skip`);

  return result;
}
