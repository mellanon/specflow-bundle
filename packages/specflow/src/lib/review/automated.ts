/**
 * Review - Automated Checks Layer
 * Runs automated checks (typecheck, lint, test) and verifies
 * spec-code file alignment.
 */

import { join, relative } from "path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";

// =============================================================================
// Types
// =============================================================================

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  duration: number;
}

export interface FileAlignmentResult {
  /** Files referenced in spec that exist in codebase */
  matched: string[];
  /** Files referenced in spec that are missing */
  missing: string[];
  /** Files in spec directory not referenced in spec */
  unreferenced: string[];
}

export interface AutomatedReviewResult {
  /** When the review was run */
  reviewedAt: string;
  /** Feature ID */
  featureId: string;
  /** Results from automated checks */
  checks: CheckResult[];
  /** Spec-code file alignment */
  alignment: FileAlignmentResult;
  /** Overall pass/fail */
  passed: boolean;
}

// =============================================================================
// Automated Check Runners
// =============================================================================

function runCheck(
  name: string,
  command: string,
  args: string[],
  cwd: string
): Promise<CheckResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn(command, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 60000,
    });

    let output = "";

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        name,
        passed: code === 0,
        output: output.trim().substring(0, 2000),
        duration: Date.now() - start,
      });
    });

    proc.on("error", (err) => {
      resolve({
        name,
        passed: false,
        output: `Command not found: ${err.message}`,
        duration: Date.now() - start,
      });
    });
  });
}

/**
 * Detect and run available automated checks
 */
export async function runAutomatedChecks(
  projectPath: string
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const packageJsonPath = join(projectPath, "package.json");

  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const scripts = pkg.scripts || {};

    // TypeScript check
    if (scripts.typecheck || existsSync(join(projectPath, "tsconfig.json"))) {
      const cmd = scripts.typecheck ? "bun" : "bunx";
      const args = scripts.typecheck ? ["run", "typecheck"] : ["tsc", "--noEmit"];
      checks.push(await runCheck("typecheck", cmd, args, projectPath));
    }

    // Lint
    if (scripts.lint) {
      checks.push(await runCheck("lint", "bun", ["run", "lint"], projectPath));
    }

    // Test
    if (scripts.test) {
      checks.push(await runCheck("test", "bun", ["test"], projectPath));
    }
  }

  // Cargo (Rust)
  if (existsSync(join(projectPath, "Cargo.toml"))) {
    checks.push(await runCheck("cargo-check", "cargo", ["check"], projectPath));
    checks.push(await runCheck("cargo-test", "cargo", ["test"], projectPath));
  }

  // Python
  if (existsSync(join(projectPath, "pyproject.toml")) || existsSync(join(projectPath, "setup.py"))) {
    checks.push(await runCheck("pytest", "pytest", [], projectPath));
  }

  return checks;
}

// =============================================================================
// File Alignment
// =============================================================================

/**
 * Extract file paths referenced in a spec
 */
function extractSpecFiles(specContent: string): string[] {
  const paths: string[] = [];
  const matches = specContent.matchAll(/`([a-zA-Z0-9_/.\\-]+\.\w{1,6})`/g);
  for (const match of matches) {
    const path = match[1];
    // Filter to likely source files
    if (
      path.includes("/") &&
      !path.startsWith("http") &&
      !path.includes("node_modules")
    ) {
      paths.push(path);
    }
  }
  return [...new Set(paths)];
}

/**
 * Check spec-code file alignment
 */
export function checkFileAlignment(
  specContent: string,
  projectPath: string
): FileAlignmentResult {
  const specFiles = extractSpecFiles(specContent);
  const matched: string[] = [];
  const missing: string[] = [];

  for (const file of specFiles) {
    if (existsSync(join(projectPath, file))) {
      matched.push(file);
    } else {
      missing.push(file);
    }
  }

  return { matched, missing, unreferenced: [] };
}

// =============================================================================
// Report Generator
// =============================================================================

export function generateReviewMarkdown(result: AutomatedReviewResult): string {
  const lines: string[] = [];

  lines.push(`# Review: ${result.featureId}`);
  lines.push(`\nReviewed: ${result.reviewedAt}`);
  lines.push(`\nOverall: ${result.passed ? "PASS" : "FAIL"}`);

  lines.push(`\n## Automated Checks\n`);
  lines.push(`| Check | Status | Duration |`);
  lines.push(`|-------|--------|----------|`);

  for (const check of result.checks) {
    const status = check.passed ? "PASS" : "FAIL";
    lines.push(`| ${check.name} | ${status} | ${check.duration}ms |`);
  }

  // Failed check details
  const failed = result.checks.filter((c) => !c.passed);
  if (failed.length > 0) {
    lines.push(`\n### Failed Check Details\n`);
    for (const check of failed) {
      lines.push(`#### ${check.name}\n`);
      lines.push("```");
      lines.push(check.output);
      lines.push("```\n");
    }
  }

  lines.push(`\n## Spec-Code Alignment\n`);
  lines.push(`- Matched files: ${result.alignment.matched.length}`);
  lines.push(`- Missing files: ${result.alignment.missing.length}`);

  if (result.alignment.missing.length > 0) {
    lines.push(`\n### Missing Files\n`);
    for (const file of result.alignment.missing) {
      lines.push(`- \`${file}\``);
    }
  }

  return lines.join("\n");
}

/**
 * Write review result
 */
export function writeReviewResult(
  specPath: string,
  result: AutomatedReviewResult
): string {
  const reviewsDir = join(specPath, "..", "..", "reviews");
  mkdirSync(reviewsDir, { recursive: true });

  const reviewPath = join(reviewsDir, `${result.featureId}-review.md`);
  writeFileSync(reviewPath, generateReviewMarkdown(result));
  return reviewPath;
}
