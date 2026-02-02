/**
 * Harden Retest — F-023
 * Re-evaluates only previously-failed test cases, preserving passing results
 */

import { join } from "path";
import { readProtocol } from "./protocol-writer";
import { evaluateTestCase } from "./headless-evaluator";
import { readEvaluation, readTriage, writeEvaluation } from "./artifacts";
import type { EvaluationResult, EvaluationTestCase } from "../../types";

/**
 * Re-evaluate non-accepted failures, preserve prior passes
 */
export function runRetest(
  projectPath: string,
  featureId: string,
  specPath: string
): EvaluationResult {
  const prevEval = readEvaluation(projectPath, featureId);
  const triage = readTriage(projectPath, featureId);

  // Build set of accepted test case IDs
  const acceptedIds = new Set(
    triage.decisions
      .filter((d) => d.category === "accept")
      .map((d) => d.testCaseId)
  );

  // Identify retest candidates: not pass AND not accepted
  const retestIds = new Set(
    prevEval.testCases
      .filter((tc) => tc.status !== "pass" && !acceptedIds.has(tc.id))
      .map((tc) => tc.id)
  );

  if (retestIds.size === 0) {
    console.log("  No cases to retest (all pass or accepted)");
    return prevEval;
  }

  // Read protocol to get full test case data for evaluateTestCase
  const hardenDir = join(projectPath, ".specify", "harden", featureId.toLowerCase());
  const protocolPath = join(hardenDir, "protocol.md");
  const protocolCases = readProtocol(protocolPath);
  const protocolMap = new Map(protocolCases.map((tc) => [tc.id, tc]));

  // Re-evaluate candidates
  const retested: EvaluationTestCase[] = [];
  for (const id of retestIds) {
    const tc = protocolMap.get(id);
    if (!tc) {
      // Keep previous result if protocol case not found
      const prev = prevEval.testCases.find((c) => c.id === id);
      if (prev) retested.push(prev);
      continue;
    }

    const verdict = evaluateTestCase(projectPath, featureId, specPath, tc);
    retested.push({
      id: tc.id,
      status: verdict.status,
      evidence: verdict.evidence,
      notes: verdict.notes,
    });
  }

  const retestedMap = new Map(retested.map((r) => [r.id, r]));

  // Merge: keep prior results, override retested ones
  const mergedCases = prevEval.testCases.map((tc) =>
    retestedMap.has(tc.id) ? retestedMap.get(tc.id)! : tc
  );

  const summary = {
    total: mergedCases.length,
    pass: mergedCases.filter((c) => c.status === "pass").length,
    fail: mergedCases.filter((c) => c.status === "fail").length,
    skip: mergedCases.filter((c) => c.status === "skip").length,
  };

  const result: EvaluationResult = {
    featureId,
    evaluatedAt: new Date().toISOString(),
    protocolHash: prevEval.protocolHash,
    testCases: mergedCases,
    summary,
  };

  writeEvaluation(projectPath, featureId, result);

  const retestPass = retested.filter((r) => r.status === "pass").length;
  const retestFail = retested.filter((r) => r.status !== "pass").length;
  console.log(`  Retested ${retestIds.size} cases: ${retestPass} pass, ${retestFail} fail`);

  return result;
}
