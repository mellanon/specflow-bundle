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

  const lines: string[] = [];

  lines.push("# SpecFlow Review Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Features Reviewed | ${sorted.length} |`);
  lines.push(`| Passed | ${passed.length} |`);
  lines.push(`| Failed | ${failed.length} |`);
  lines.push(`| Average Score | ${avgScore.toFixed(0)}% |`);
  lines.push(`| Critical Findings | ${totalCritical} |`);
  lines.push("");
  lines.push("## Results");
  lines.push("");

  // Passed section (collapsed)
  lines.push(`### Passed (${passed.length})`);
  lines.push("");
  if (passed.length === 0) {
    lines.push("_None_");
  } else {
    for (const r of passed) {
      const scoreStr = r.summary.score !== null ? `${(r.summary.score * 100).toFixed(0)}%` : "-";
      lines.push(`- ${r.featureId} — ${scoreStr}`);
    }
  }
  lines.push("");

  // Failed section (expanded)
  lines.push(`### Needs Attention (${failed.length})`);
  lines.push("");
  if (failed.length === 0) {
    lines.push("_None_");
  } else {
    for (const r of failed) {
      const scoreStr = r.summary.score !== null ? `${(r.summary.score * 100).toFixed(0)}%` : "-";
      lines.push(`#### ${r.featureId} — FAIL — ${scoreStr}`);
      lines.push("");

      // Automated checks
      const ac = r.automatedChecks;
      lines.push(`**Automated Checks:** ${ac.passed ? "pass" : "fail"}`);
      lines.push(`- Alignment: ${ac.alignment.matched} matched, ${ac.alignment.missing} missing`);
      lines.push("");

      // AI Findings
      if (r.aiReview && r.aiReview.findings.length > 0) {
        lines.push("**AI Findings:**");
        for (const f of r.aiReview.findings) {
          const icon = f.severity === "critical" ? "!!" : f.severity === "warning" ? "!" : "i";
          lines.push(`- ${icon} ${f.severity} — [${f.area}] ${f.description}`);
        }
      } else {
        lines.push("**AI Findings:** _None_");
      }

      // Autofix actions (so human can review what AI did)
      if (r.autofix) {
        lines.push("");
        if (r.autofix.attempted && r.autofix.fixed) {
          lines.push(`**Autofix Applied** (${r.autofix.changes.length} change(s)):`);
          for (const c of r.autofix.changes) {
            lines.push(`- \`${c.file}\` — ${c.description}`);
          }
        } else if (r.autofix.attempted && r.autofix.error) {
          lines.push(`**Autofix Failed:** ${r.autofix.error}`);
        } else if (r.autofix.attempted) {
          lines.push("**Autofix:** Attempted but no changes made");
        }
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    }
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
