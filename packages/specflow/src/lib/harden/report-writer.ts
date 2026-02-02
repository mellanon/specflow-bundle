/**
 * Harden Report Writer
 * Generates harden-report.md from session results
 */

import { writeFileSync, renameSync } from "fs";
import { join } from "path";
import type { HardenTestCase, HardenSession } from "../../types";
import { readTriageOptional, readFixesOptional } from "./artifacts";

/**
 * Write harden-report.md
 */
export function writeReport(
  outputDir: string,
  featureId: string,
  featureName: string,
  session: HardenSession,
  testCases: HardenTestCase[],
  projectPath?: string
): string {
  const reportPath = join(outputDir, "harden-report.md");
  const overallResult = session.failed > 0 ? "FAIL" : "PASS";

  let md = `# Harden Report: ${featureId} — ${featureName}\n\n`;
  md += `## Summary\n`;
  md += `- **Date:** ${new Date().toISOString()}\n`;
  md += `- **Total Tests:** ${session.totalTests}\n`;
  md += `- **Passed:** ${session.passed} | **Failed:** ${session.failed} | **Skipped:** ${session.skipped}\n`;
  md += `- **Result:** ${overallResult}\n\n`;

  md += `## Test Results\n\n`;
  md += `| TC | Description | Type | Status | Notes |\n`;
  md += `|----|-------------|------|--------|-------|\n`;
  for (const tc of testCases) {
    const notes = tc.notes || "";
    md += `| ${tc.id} | ${tc.description.substring(0, 60)} | ${tc.type} | ${tc.status} | ${notes} |\n`;
  }
  md += "\n";

  // Issues found
  const failures = testCases.filter((tc) => tc.status === "fail");
  if (failures.length > 0) {
    md += `## Issues Found\n\n`;
    for (const tc of failures) {
      md += `- **${tc.id}:** ${tc.description}\n`;
      if (tc.notes) {
        md += `  - ${tc.notes}\n`;
      }
    }
    md += "\n";
  }

  // Triage and fix descriptors (if available)
  if (projectPath) {
    const triage = readTriageOptional(projectPath, featureId);
    if (triage && triage.decisions.length > 0) {
      md += `## Triage Decisions\n\n`;
      md += `| TC | Category | Reasoning | Suggested Fix |\n`;
      md += `|----|----------|-----------|---------------|\n`;
      for (const d of triage.decisions) {
        md += `| ${d.testCaseId} | ${d.category} | ${d.reasoning.substring(0, 80)} | ${(d.suggestedFix || "-").substring(0, 60)} |\n`;
      }
      md += "\n";
    }

    const fixes = readFixesOptional(projectPath, featureId);
    if (fixes && fixes.descriptors.length > 0) {
      md += `## AI Fix Descriptors\n\n`;
      for (const f of fixes.descriptors) {
        md += `### ${f.testCaseId} — \`${f.filePath}\`\n`;
        md += `- **Issue:** ${f.description}\n`;
        md += `- **Suggested Change:** ${f.suggestedChange}\n\n`;
      }
    }
  }

  md += `## Recommendation\n\n`;
  if (overallResult === "PASS") {
    md += `PROCEED to COMPLETE -- all required tests passed.\n`;
  } else {
    md += `RETURN to IMPLEMENT -- ${failures.length} test(s) failed. Address issues above before completing.\n`;
  }

  // Atomic write
  const tmpPath = reportPath + ".tmp";
  writeFileSync(tmpPath, md);
  renameSync(tmpPath, reportPath);

  return reportPath;
}
