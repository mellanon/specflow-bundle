/**
 * Harden Report Writer
 * Generates harden-report.md from session results
 */

import { writeFileSync, renameSync } from "fs";
import { join } from "path";
import type { HardenTestCase, HardenSession } from "../../types";

/**
 * Write harden-report.md
 */
export function writeReport(
  outputDir: string,
  featureId: string,
  featureName: string,
  session: HardenSession,
  testCases: HardenTestCase[]
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
