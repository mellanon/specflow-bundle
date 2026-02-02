/**
 * Harden Triage — F-023
 * Classifies evaluation failures into bug/spec-gap/accept using AI inference
 */

import { spawnSync } from "child_process";
import { readEvaluation, writeTriage } from "./artifacts";
import type { TriageResult, TriageDecision, TriageCategory } from "../../types";

/**
 * Run triage on evaluation failures
 */
export function runTriage(
  projectPath: string,
  featureId: string
): TriageResult {
  const evaluation = readEvaluation(projectPath, featureId);

  const failures = evaluation.testCases.filter((tc) => tc.status === "fail");

  if (failures.length === 0) {
    const result: TriageResult = {
      featureId,
      triagedAt: new Date().toISOString(),
      decisions: [],
      summary: { bugs: 0, specGaps: 0, accepted: 0 },
    };
    writeTriage(projectPath, featureId, result);
    console.log("  0 bugs, 0 spec-gaps, 0 accepted (no failures to triage)");
    return result;
  }

  const decisions: TriageDecision[] = [];

  for (const tc of failures) {
    const prompt = `You are a QA triage engineer. Classify this test failure.

## Test Case: ${tc.id}
- **Evidence:** ${tc.evidence}
- **Notes:** ${tc.notes || "none"}

## Categories:
- bug: Code defect that needs fixing. Include file path and description in suggestedFix.
- spec-gap: The specification is wrong or incomplete. Include suggested amendment in suggestedAmendment.
- accept: Known limitation, acceptable as-is. Include justification.

Respond with EXACTLY this JSON (no markdown, no code blocks, just raw JSON):
{"category": "bug|spec-gap|accept", "reasoning": "why this classification", "suggestedFix": "file and description or null", "suggestedAmendment": "spec change or null", "justification": "why acceptable or null"}`;

    const result = spawnSync("claude", ["-p", prompt, "--output-format", "json"], {
      cwd: projectPath,
      timeout: 60000,
      encoding: "utf-8",
      env: { ...process.env },
    });

    let decision: TriageDecision = {
      testCaseId: tc.id,
      category: "bug",
      reasoning: "Classification failed — defaulting to bug",
      suggestedFix: null,
      suggestedAmendment: null,
      justification: null,
    };

    if (!result.error && result.status === 0) {
      try {
        const parsed = parseTriageResponse(result.stdout.trim());
        decision = {
          testCaseId: tc.id,
          category: validateCategory(parsed.category),
          reasoning: parsed.reasoning || "No reasoning provided",
          suggestedFix: parsed.suggestedFix || null,
          suggestedAmendment: parsed.suggestedAmendment || null,
          justification: parsed.justification || null,
        };
      } catch {
        // Keep default bug classification
      }
    }

    decisions.push(decision);
  }

  const summary = {
    bugs: decisions.filter((d) => d.category === "bug").length,
    specGaps: decisions.filter((d) => d.category === "spec-gap").length,
    accepted: decisions.filter((d) => d.category === "accept").length,
  };

  const result: TriageResult = {
    featureId,
    triagedAt: new Date().toISOString(),
    decisions,
    summary,
  };

  writeTriage(projectPath, featureId, result);

  console.log(`  ${summary.bugs} bugs, ${summary.specGaps} spec-gaps, ${summary.accepted} accepted`);

  return result;
}

function validateCategory(cat: string): TriageCategory {
  if (cat === "bug" || cat === "spec-gap" || cat === "accept") return cat;
  return "bug";
}

function parseTriageResponse(output: string): any {
  // Same pattern as headless-evaluator: handle claude --output-format json wrapper
  try {
    const wrapper = JSON.parse(output);
    if (wrapper.result) {
      const text = wrapper.result;
      const jsonMatch = text.match(/\{[\s\S]*"category"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(text);
    }
    if (wrapper.category) return wrapper;
  } catch {}

  try {
    return JSON.parse(output);
  } catch {}

  const match = output.match(/\{[\s\S]*"category"[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);

  throw new Error("No parseable triage response found");
}
