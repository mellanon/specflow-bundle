/**
 * Review Artifact I/O — F-024
 * Atomic read/write utilities for review.json in .specify/review/{featureId}/
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
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
 * Exception-based: passes are collapsed, failures are expanded with findings.
 * Returns the absolute path of the written report.
 */
export function generateReviewReport(projectPath: string): string {
  const results = readAllReviewJsons(projectPath);
  const sorted = results.sort((a, b) => a.featureId.localeCompare(b.featureId));

  const passed = sorted.filter((r) => r.passed);
  const failed = sorted.filter((r) => !r.passed);
  const totalScore = sorted.reduce((sum, r) => sum + (r.summary.score ?? 0), 0);
  const avgScore = sorted.length > 0 ? (totalScore / sorted.length) * 100 : 0;
  const totalCritical = sorted.reduce((sum, r) => sum + r.summary.findingsCount.critical, 0);

  const totalWarnings = sorted.reduce((sum, r) => sum + r.summary.findingsCount.warning, 0);
  const totalInfo = sorted.reduce((sum, r) => sum + r.summary.findingsCount.info, 0);
  const checksWithScores = sorted.filter((r) => r.summary.score !== null && r.summary.score > 0);
  const realAvgScore = checksWithScores.length > 0
    ? (checksWithScores.reduce((sum, r) => sum + (r.summary.score ?? 0), 0) / checksWithScores.length) * 100
    : null;

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
  lines.push(`| AI Alignment Score | ${realAvgScore !== null ? `${realAvgScore.toFixed(0)}%` : "_not run_"} |`);
  lines.push(`| Critical Findings | ${totalCritical} |`);
  lines.push(`| Warnings | ${totalWarnings} |`);
  lines.push(`| Info | ${totalInfo} |`);
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

  // Results table — all features at a glance
  lines.push("## Feature Results");
  lines.push("");
  lines.push(`| Feature | Name | Result | Score | Files | Findings |`);
  lines.push(`|---------|------|--------|-------|-------|----------|`);
  for (const r of sorted) {
    const name = r.featureName || "";
    const result = r.passed ? "PASS" : "**FAIL**";
    const scoreStr = r.summary.score !== null && r.summary.score > 0
      ? `${(r.summary.score * 100).toFixed(0)}%`
      : "-";
    const files = `${r.automatedChecks.alignment.matched}/${r.automatedChecks.alignment.matched + r.automatedChecks.alignment.missing}`;
    const fc = r.summary.findingsCount;
    const findingsStr = fc.critical + fc.warning + fc.info > 0
      ? `${fc.critical}c ${fc.warning}w ${fc.info}i`
      : "-";
    lines.push(`| ${r.featureId} | ${name.substring(0, 40)} | ${result} | ${scoreStr} | ${files} | ${findingsStr} |`);
  }
  lines.push("");

  // Failed features — expanded detail
  if (failed.length > 0) {
    lines.push("## Needs Attention");
    lines.push("");

    for (const r of failed) {
      const name = r.featureName || r.featureId;
      const scoreStr = r.summary.score !== null && r.summary.score > 0
        ? `${(r.summary.score * 100).toFixed(0)}%`
        : "no score";
      lines.push(`### ${r.featureId} — ${name} (${scoreStr})`);
      lines.push("");

      // Automated checks
      const ac = r.automatedChecks;
      lines.push(`**Automated Checks:** ${ac.passed ? "pass" : "fail"}`);
      if (ac.alignment.missing > 0) {
        lines.push(`- Missing files: ${ac.alignment.missing}`);
      }
      lines.push(`- Matched files: ${ac.alignment.matched}`);
      lines.push("");

      // AI Findings
      if (r.aiReview && r.aiReview.findings.length > 0) {
        lines.push("**AI Findings:**");
        for (const f of r.aiReview.findings) {
          const icon = f.severity === "critical" ? "!!" : f.severity === "warning" ? "!" : "i";
          lines.push(`- ${icon} **${f.severity}** — [${f.area}] ${f.description}`);
        }
        lines.push("");
      }

      // Autofix actions (so human can review what AI did)
      if (r.autofix) {
        if (r.autofix.attempted && r.autofix.fixed) {
          lines.push(`**Autofix Applied** (${r.autofix.changes.length} change(s)):`);
          for (const c of r.autofix.changes) {
            lines.push(`- \`${c.file}\` — ${c.description}`);
          }
          lines.push("");
        } else if (r.autofix.attempted && r.autofix.error) {
          lines.push(`**Autofix Failed:** ${r.autofix.error}`);
          lines.push("");
        } else if (r.autofix.attempted) {
          lines.push("**Autofix:** Attempted but no changes made");
          lines.push("");
        }
      }

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

  // Atomic write: temp + rename
  const outDir = join(projectPath, ".specify");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "REVIEW_REPORT.md");
  const tmp = outPath + ".tmp";
  writeFileSync(tmp, content);
  renameSync(tmp, outPath);

  return outPath;
}
