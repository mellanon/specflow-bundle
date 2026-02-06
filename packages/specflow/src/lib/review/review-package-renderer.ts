/**
 * Review Package Renderer
 *
 * Renders a comprehensive review-package.md from compiled evidence.
 * The review package is evidence for the human, not a verdict.
 */

import { writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import type { ReviewPackage } from "./evidence-compiler";
import { getHardenProgressSummary } from "../harden/acceptance-spec-ingest";

/**
 * Render a review package to markdown
 */
export function renderReviewPackage(pkg: ReviewPackage): string {
  const lines: string[] = [];

  // One-line triage verdict (HITL: context in 5 seconds)
  if (pkg.verdict.allPass) {
    lines.push(`> **VERDICT: ALL PASS** — approve with \`specflow approve ${pkg.featureId}\``);
  } else {
    const issues: string[] = [];
    if (!pkg.verdict.automatedPass) issues.push("automated checks");
    if (!pkg.verdict.alignmentPass) issues.push("file alignment");
    if (pkg.verdict.acceptanceTestsPass === false) issues.push("acceptance tests");
    lines.push(`> **VERDICT: NEEDS ATTENTION** — ${issues.join(", ")} failed`);
  }
  lines.push(``);

  // Header
  lines.push(`# Review Package: ${pkg.featureId}`);
  lines.push(``);
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| **Feature** | ${pkg.featureId} — ${pkg.featureName} |`);
  lines.push(`| **Compiled** | ${pkg.compiledAt.substring(0, 19)} |`);
  lines.push(`| **Verdict** | ${pkg.verdict.allPass ? "ALL PASS" : "NEEDS ATTENTION"} |`);
  lines.push(``);

  // Reviewer Guide — tells the human exactly what they're doing
  const fid = pkg.featureId.toLowerCase();
  lines.push(`## Reviewer Guide`);
  lines.push(``);
  lines.push(`> **Your decision:** Should ${pkg.featureId} move from REVIEW to APPROVE?`);
  lines.push(``);
  lines.push(`**Reviewer checklist** (binary — YES or NO for each):`);
  lines.push(`- [ ] Automated checks pass (or failures are acceptable)`);
  lines.push(`- [ ] Implementation files match spec (no missing files)`);
  lines.push(`- [ ] Acceptance tests cover the spec requirements`);
  lines.push(`- [ ] Acceptance test evidence is sufficient (not just "manual_check")`);
  lines.push(``);
  lines.push(`**Where to find things:**`);
  lines.push(`| Artifact | Path |`);
  lines.push(`|----------|------|`);
  lines.push(`| Spec | \`.specify/specs/${fid}-*/spec.md\` |`);
  lines.push(`| Acceptance tests | \`.specify/harden/${fid}/acceptance-test.md\` |`);
  lines.push(`| AT results | \`.specify/harden/${fid}/results.json\` |`);
  lines.push(`| AT history | \`specflow harden ${pkg.featureId} --history\` |`);
  lines.push(`| This package | \`.specify/review/${fid}/review-package.md\` |`);
  lines.push(``);
  lines.push(`**After reviewing:**`);
  lines.push(`- Approve: \`specflow approve ${pkg.featureId}\` (feature moves to EVOLVE)`);
  lines.push(`- Reject: \`specflow reject ${pkg.featureId} --reason "REASON"\` (feature returns to IMPLEMENT)`);
  lines.push(`- Decision codes: \`INCOMPLETE\`, \`QUALITY\`, \`SPEC_DRIFT\`, \`REGRESSION\` (or free text)`);
  lines.push(``);

  if (pkg.featureDescription) {
    lines.push(`## Feature Summary`);
    lines.push(``);
    lines.push(pkg.featureDescription);
    lines.push(``);
  }

  // Section 1: Automated Checks
  lines.push(`## Automated Checks`);
  lines.push(``);

  if (pkg.automatedChecks.checks.length === 0) {
    lines.push(`_No automated checks available._`);
  } else {
    lines.push(`| Check | Result | Duration |`);
    lines.push(`|-------|--------|----------|`);
    for (const check of pkg.automatedChecks.checks) {
      const icon = check.passed ? "PASS" : "**FAIL**";
      lines.push(`| ${check.name} | ${icon} | ${check.duration}ms |`);
    }

    // Show failure details
    const failed = pkg.automatedChecks.checks.filter((c) => !c.passed);
    if (failed.length > 0) {
      lines.push(``);
      lines.push(`### Failed Check Details`);
      for (const check of failed) {
        lines.push(``);
        lines.push(`#### ${check.name}`);
        lines.push(`\`\`\``);
        lines.push(check.output.substring(0, 2000));
        lines.push(`\`\`\``);
      }
    }
  }
  lines.push(``);

  // Section 2: File Alignment
  lines.push(`## File Alignment`);
  lines.push(``);
  lines.push(`- Matched files: ${pkg.fileAlignment.matched.length}`);
  lines.push(`- Missing files: ${pkg.fileAlignment.missing.length}`);

  if (pkg.fileAlignment.missing.length > 0) {
    lines.push(``);
    lines.push(`### Missing Files`);
    for (const file of pkg.fileAlignment.missing) {
      lines.push(`- \`${file}\``);
    }
  }
  lines.push(``);

  // Section 3: Acceptance Test Results
  lines.push(`## Acceptance Test Results`);
  lines.push(``);

  if (!pkg.acceptanceTests.available) {
    lines.push(
      `_No acceptance tests available. Run \`specflow harden ${pkg.featureId}\` to generate._`
    );
  } else {
    const results = pkg.acceptanceTests.results!;
    const s = results.summary;
    lines.push(`| Total | Pass | Fail | Skip | Pending |`);
    lines.push(`|-------|------|------|------|---------|`);
    lines.push(`| ${s.total} | ${s.pass} | ${s.fail} | ${s.skip} | ${s.pending} |`);
    lines.push(``);

    // Show AT iteration history if multiple ingests exist
    const atProgress = getHardenProgressSummary(process.cwd(), pkg.featureId);
    if (atProgress && atProgress.totalIngests > 1) {
      const pctNow = Math.round(atProgress.passRateHistory[atProgress.passRateHistory.length - 1] ?? 0);
      const trendIcon = atProgress.trend === "improving" ? "trending up" : atProgress.trend === "regressing" ? "trending down" : "stable";
      lines.push(`**Acceptance test history:** ${atProgress.totalIngests} ingests | ${pctNow}% pass rate | ${trendIcon}`);
      lines.push(``);
    }

    for (const test of results.tests) {
      const icon =
        test.status === "pass"
          ? "+"
          : test.status === "fail"
            ? "x"
            : test.status === "skip"
              ? "-"
              : "?";
      lines.push(`- ${icon} **${test.id}**: ${test.title} — \`${test.status}\``);
      if (test.findings) {
        lines.push(`  - Findings: ${test.findings}`);
      }
    }
  }
  lines.push(``);

  // Section 4: Verdict Summary
  lines.push(`## Verdict Summary`);
  lines.push(``);
  lines.push(`| Area | Result |`);
  lines.push(`|------|--------|`);
  lines.push(
    `| Automated Checks | ${pkg.verdict.automatedPass ? "PASS" : "**FAIL**"} |`
  );
  lines.push(
    `| File Alignment | ${pkg.verdict.alignmentPass ? "PASS" : "**FAIL**"} |`
  );
  lines.push(
    `| Acceptance Tests | ${
      pkg.verdict.acceptanceTestsPass === null
        ? "_not available_"
        : pkg.verdict.acceptanceTestsPass
          ? "PASS"
          : "**FAIL**"
    } |`
  );
  lines.push(
    `| **Overall** | ${pkg.verdict.allPass ? "**PASS**" : "**NEEDS ATTENTION**"} |`
  );
  lines.push(``);

  // Section 5: Decision
  lines.push(`## Decision`);
  lines.push(``);
  if (pkg.verdict.allPass) {
    lines.push(`All checks passed.`);
    lines.push(``);
    lines.push(`\`\`\`bash`);
    lines.push(`specflow approve ${pkg.featureId}`);
    lines.push(`\`\`\``);
  } else {
    lines.push(`Some checks need attention. Review the failures above, then:`);
    lines.push(``);
    lines.push(`\`\`\`bash`);
    lines.push(`specflow approve ${pkg.featureId}                        # Approve despite failures`);
    lines.push(`specflow reject ${pkg.featureId} --reason QUALITY        # Reject with decision code`);
    lines.push(`specflow reject ${pkg.featureId} --reason "custom text"  # Reject with free text`);
    lines.push(`\`\`\``);
  }
  lines.push(``);
  lines.push(
    `---`
  );
  lines.push(
    `*Generated by SpecFlow Review*`
  );

  return lines.join("\n") + "\n";
}

/**
 * Write review-package.md to the review directory
 */
export function writeReviewPackage(
  projectPath: string,
  featureId: string,
  content: string
): string {
  const dir = join(
    projectPath,
    ".specify",
    "review",
    featureId.toLowerCase()
  );
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, "review-package.md");
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, filePath);

  return filePath;
}
