/**
 * Review Artifact I/O
 * Atomic read/write utilities for review.json in .specify/review/{featureId}/
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ReviewResult } from "../../types";

/**
 * Get the review directory for a feature, creating it if absent
 */
export function reviewDir(projectPath: string, featureId: string): string {
  const dir = join(projectPath, ".specify", "review", featureId.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Atomically write review.json for a feature
 */
export function writeReviewJson(projectPath: string, featureId: string, result: ReviewResult): string {
  const dir = reviewDir(projectPath, featureId);
  const filePath = join(dir, "review.json");
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n");
  renameSync(tmp, filePath);
  return filePath;
}

/**
 * Read review.json for a feature, returning null if missing
 */
export function readReviewJson(projectPath: string, featureId: string): ReviewResult | null {
  const dir = join(projectPath, ".specify", "review", featureId.toLowerCase());
  const filePath = join(dir, "review.json");
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as ReviewResult;
}

/**
 * Read all review.json artifacts across all features
 */
export function readAllReviewJsons(projectPath: string): ReviewResult[] {
  const baseDir = join(projectPath, ".specify", "review");
  if (!existsSync(baseDir)) return [];

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const results: ReviewResult[] = [];
  for (const dir of dirs) {
    const filePath = join(baseDir, dir, "review.json");
    if (existsSync(filePath)) {
      try {
        results.push(JSON.parse(readFileSync(filePath, "utf-8")) as ReviewResult);
      } catch {
        // Skip malformed files
      }
    }
  }
  return results;
}

/**
 * Generate a consolidated markdown review report from all review.json artifacts.
 * Exception-based: passes are collapsed, failures are expanded.
 */
export function generateReviewReport(projectPath: string): string {
  const results = readAllReviewJsons(projectPath);
  const sorted = results.sort((a, b) => a.featureId.localeCompare(b.featureId));

  const passed = sorted.filter((r) => r.passed);
  const failed = sorted.filter((r) => !r.passed);

  // Aggregate AT counts
  let totalATs = 0, totalATPass = 0, totalATFail = 0, totalATSkip = 0, totalATPending = 0;
  let hardenedCount = 0;
  for (const r of sorted) {
    const at = r.acceptanceTests;
    if (at && at.available) {
      hardenedCount++;
      totalATs += at.total;
      totalATPass += at.pass;
      totalATFail += at.fail;
      totalATSkip += at.skip;
      totalATPending += at.pending;
    }
  }

  const lines: string[] = [];

  lines.push("# SpecFlow Review Report");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Features Reviewed | ${sorted.length} |`);
  lines.push(`| Passed | **${passed.length}** |`);
  lines.push(`| Failed | **${failed.length}** |`);
  lines.push(`| Features Hardened | ${hardenedCount}/${sorted.length} |`);
  lines.push(`| Acceptance Tests | ${totalATs} (${totalATPass} pass, ${totalATFail} fail, ${totalATSkip} skip, ${totalATPending} pending) |`);
  lines.push("");

  // Automated checks summary (project-wide)
  if (sorted.length > 0 && sorted[0].automatedChecks.checks.length > 0) {
    lines.push("## Automated Checks (Project-Wide)");
    lines.push("");
    for (const c of sorted[0].automatedChecks.checks) {
      const icon = c.passed ? "+" : "x";
      lines.push(`- ${icon} **${c.name}** (${c.duration}ms)`);
    }
    lines.push("");
  }

  // Results table
  lines.push("## Feature Results");
  lines.push("");
  lines.push(`| Feature | Name | Result | ATs | Alignment |`);
  lines.push(`|---------|------|--------|-----|-----------|`);
  for (const r of sorted) {
    const name = r.featureName || "";
    const result = r.passed ? "PASS" : "**FAIL**";
    const at = r.acceptanceTests;
    const atsStr = at && at.available ? `${at.pass}/${at.total}` : "-";
    const alignStr = r.automatedChecks.alignment.missing > 0
      ? `${r.automatedChecks.alignment.missing} missing`
      : "ok";
    lines.push(`| ${r.featureId} | ${name.substring(0, 40)} | ${result} | ${atsStr} | ${alignStr} |`);
  }
  lines.push("");

  // Failed features — expanded detail
  if (failed.length > 0) {
    lines.push("## Needs Attention");
    lines.push("");

    for (const r of failed) {
      const name = r.featureName || r.featureId;
      lines.push(`### ${r.featureId} — ${name}`);
      lines.push("");

      // Automated checks
      const ac = r.automatedChecks;
      lines.push(`**Automated Checks:** ${ac.passed ? "pass" : "fail"}`);
      if (ac.alignment.missing > 0) {
        lines.push(`- Missing files: ${ac.alignment.missing}`);
      }
      lines.push("");

      // Acceptance test summary
      const at = r.acceptanceTests;
      if (at && at.available) {
        lines.push(`**Acceptance Tests:** ${at.pass}/${at.total} pass, ${at.fail} fail`);
        lines.push("");
      }

      lines.push(`**Action:** \`specflow approve ${r.featureId}\` or \`specflow reject ${r.featureId} --reason "..."\``);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  } else {
    lines.push("## Needs Attention");
    lines.push("");
    lines.push("_All features passed review._");
    lines.push("");
  }

  const content = lines.join("\n") + "\n";

  // Atomic write
  const outDir = join(projectPath, ".specify");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "REVIEW_REPORT.md");
  const tmp = outPath + ".tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, outPath);

  return outPath;
}
