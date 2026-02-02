/**
 * Review - Structured Human Review Template
 * Generates a review template pre-filled from automated and AI findings.
 */

import { appendFileSync } from "fs";
import type { AutomatedReviewResult } from "./automated";
import type { AIReviewResult } from "./ai-review";

// =============================================================================
// Template Generator
// =============================================================================

/**
 * Generate and append a structured human review template
 */
export function appendHumanReviewTemplate(
  reviewPath: string,
  automated: AutomatedReviewResult,
  aiReview: AIReviewResult | null
): void {
  const lines: string[] = [];

  lines.push(`\n## Human Review\n`);
  lines.push(`_Review template generated from automated and AI findings._\n`);

  // Risk areas from AI
  const criticalFindings = aiReview?.findings.filter((f) => f.severity === "critical") ?? [];
  const warningFindings = aiReview?.findings.filter((f) => f.severity === "warning") ?? [];

  if (criticalFindings.length > 0 || warningFindings.length > 0) {
    lines.push(`### Risk Areas (Flagged by AI)\n`);
    for (const finding of criticalFindings) {
      lines.push(`- [ ] **CRITICAL** - ${finding.area}: ${finding.description}`);
    }
    for (const finding of warningFindings) {
      lines.push(`- [ ] **WARNING** - ${finding.area}: ${finding.description}`);
    }
    lines.push("");
  }

  // Checklist from automated results
  lines.push(`### Automated Check Results\n`);
  for (const check of automated.checks) {
    const status = check.passed ? "[x]" : "[ ]";
    lines.push(`- ${status} ${check.name} ${check.passed ? "(passed)" : "— NEEDS REVIEW"}`);
  }
  lines.push("");

  // File alignment
  if (automated.alignment.missing.length > 0) {
    lines.push(`### Missing File References\n`);
    for (const file of automated.alignment.missing) {
      lines.push(`- [ ] \`${file}\` — referenced in spec but not found`);
    }
    lines.push("");
  }

  // Human review sections
  lines.push(`### Specification Accuracy\n`);
  lines.push(`- [ ] All requirements are clearly stated`);
  lines.push(`- [ ] No ambiguous language`);
  lines.push(`- [ ] Edge cases are documented`);
  lines.push(`- [ ] Error handling is specified\n`);

  lines.push(`### Implementation Quality\n`);
  lines.push(`- [ ] Code matches spec intent`);
  lines.push(`- [ ] No over-engineering`);
  lines.push(`- [ ] Tests cover key scenarios`);
  lines.push(`- [ ] No security concerns\n`);

  lines.push(`### Sign-Off\n`);
  lines.push(`- [ ] **Reviewer:** _______________`);
  lines.push(`- [ ] **Date:** _______________`);
  lines.push(`- [ ] **Decision:** APPROVE / REQUEST CHANGES / REJECT\n`);
  lines.push(`**Notes:**\n`);
  lines.push(`_Add review comments here._\n`);

  appendFileSync(reviewPath, lines.join("\n"));
}
