/**
 * Acceptance Test Specification Generator
 *
 * Generates a human-readable markdown document for acceptance testing.
 * Uses workflow-level tests (3-5 per feature) instead of checkbox-level tests.
 *
 * The document is designed to be filled in by a human tester who:
 * 1. Opens the markdown on one screen
 * 2. Executes tests on the other screen
 * 3. Records pass/fail/skip with findings as they go
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { WorkflowTest, WorkflowTestResult } from "./workflow-test-generator";

/**
 * Generate acceptance test specification markdown from workflow tests
 */
export function generateAcceptanceSpec(result: WorkflowTestResult): string {
  const now = new Date().toISOString().split("T")[0];

  const featureSlug = result.featureId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const specDir = `.specify/specs/f-${featureSlug.replace("f-", "").padStart(3, "0")}-*`;
  const hardenDir = `.specify/harden/${result.featureId.toLowerCase()}`;

  const lines: string[] = [
    `# Acceptance Test Specification`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Feature** | ${result.featureId} - ${result.featureName} |`,
    `| **Version** | 1.0 |`,
    `| **Generated** | ${now} |`,
    `| **Spec Hash** | ${result.specHash.slice(0, 8)} |`,
    ``,
    `## Quick Start`,
    ``,
    `> **Your task:** Test this feature and record pass/fail for each acceptance test below.`,
    ``,
    `**What to do:**`,
    `1. Read the spec: \`${specDir}/spec.md\``,
    `2. For each AT section below, execute the **Steps** and check each **Verify** criterion`,
    `3. Set **Status** to \`pass\`, \`fail\`, or \`skip\` (delete the other two options)`,
    `4. Fill in the **Evidence** table and **Findings**`,
    `5. When all ATs are complete, run:`,
    ``,
    `\`\`\`bash`,
    `specflow harden ${result.featureId} --ingest`,
    `\`\`\``,
    ``,
    `**What happens next:** Results are saved to \`${hardenDir}/results.json\`. If all tests pass, run \`specflow review ${result.featureId}\` to compile the review package. If any fail, fix the implementation and re-test.`,
    ``,
    `## What is this feature?`,
    ``,
    `**${result.featureId} — ${result.featureName}**`,
    ``,
    result.featureDescription ? result.featureDescription : `_See spec for details._`,
    ``,
    `---`,
    ``,
    `## Summary`,
    ``,
    `| Total | Pass | Fail | Skip | Pending |`,
    `|-------|------|------|------|---------|`,
    `| ${result.tests.length} | | | | ${result.tests.length} |`,
    ``,
    `---`,
    ``,
  ];

  for (const test of result.tests) {
    lines.push(`## ${test.id}: ${test.title}`);
    lines.push(``);
    lines.push(`**Covers:** ${test.covers.join(", ")}`);
    lines.push(``);

    if (test.setup.length > 0) {
      lines.push(`### Setup`);
      for (const item of test.setup) {
        lines.push(`- ${item}`);
      }
      lines.push(``);
    }

    lines.push(`### Steps`);
    for (let i = 0; i < test.steps.length; i++) {
      lines.push(`${i + 1}. ${test.steps[i]}`);
    }
    lines.push(``);

    lines.push(`### Verify`);
    lines.push(`<!-- Each criterion should be binary testable (YES/NO in ~2 seconds) -->`);
    for (const item of test.verify) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push(``);

    lines.push(`### Result`);
    lines.push(``);
    lines.push(`**Status:** \`pass\` / \`fail\` / \`skip\``);
    lines.push(``);
    lines.push(`**Evidence:** *(How did you verify each criterion?)*`);
    lines.push(`| Criterion | Pass? | Evidence Type | Evidence |`);
    lines.push(`|-----------|-------|---------------|----------|`);
    for (let i = 0; i < Math.min(test.verify.length, 3); i++) {
      const shortCriterion = test.verify[i].slice(0, 40) + (test.verify[i].length > 40 ? "..." : "");
      lines.push(`| ${shortCriterion} | | | |`);
    }
    if (test.verify.length > 3) {
      lines.push(`| *(${test.verify.length - 3} more criteria...)* | | | |`);
    }
    lines.push(``);
    lines.push(`**Findings:** *(Observations, issues, notes)*`);
    lines.push(``);
    lines.push(``);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Add footer with evidence type reference
  lines.push(`## Evidence Type Reference`);
  lines.push(``);
  lines.push(`| Evidence Type | Example |`);
  lines.push(`|---------------|---------|`);
  lines.push(`| \`test_output\` | "bun test: 12 passed, 0 failed" |`);
  lines.push(`| \`file_content\` | "Line 47 reads: \`if (!token) return 401\`" |`);
  lines.push(`| \`tool_result\` | "curl returns 200 with \`{status: ok}\`" |`);
  lines.push(`| \`screenshot\` | "Login form renders with email/password fields" |`);
  lines.push(`| \`manual_check\` | "Grep for 'API_KEY' returns 0 matches" |`);
  lines.push(``);
  lines.push(`**Status values:** \`pass\` (all criteria met) | \`fail\` (any criterion failed) | \`skip\` (not tested)`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*Generated by SpecFlow — Evidence types from [The Algorithm](https://github.com/danielmiessler/TheAlgorithm)*`);

  return lines.join("\n");
}

/**
 * Generate acceptance spec from legacy HardenTestCase format (backwards compat)
 * @deprecated Use generateAcceptanceSpec with WorkflowTestResult instead
 */
export function generateAcceptanceSpecLegacy(
  featureId: string,
  featureName: string,
  testCases: { id: string; description: string; source: string; type: string; preconditions: string[]; steps: string[]; expectedResult: string }[],
  specHash: string,
  featureDescription?: string
): string {
  // Convert legacy format to workflow format for consistent output
  const workflowTests: WorkflowTest[] = testCases.map((tc) => ({
    id: tc.id,
    title: tc.description,
    covers: [tc.source],
    setup: tc.preconditions,
    steps: tc.steps,
    verify: [tc.expectedResult],
  }));

  return generateAcceptanceSpec({
    tests: workflowTests,
    featureId,
    featureName,
    featureDescription: featureDescription || "",
    specHash,
  });
}

/**
 * Write acceptance spec to file
 */
export function writeAcceptanceSpec(
  projectPath: string,
  featureId: string,
  content: string
): string {
  const dir = join(projectPath, ".specify", "harden", featureId.toLowerCase());
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, "acceptance-test.md");
  writeFileSync(filePath, content);

  return filePath;
}

/**
 * Read existing acceptance spec if present
 */
export function readAcceptanceSpec(
  projectPath: string,
  featureId: string
): string | null {
  const filePath = join(projectPath, ".specify", "harden", featureId.toLowerCase(), "acceptance-test.md");
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}
