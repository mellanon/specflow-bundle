/**
 * TDD Command
 * Run the TDD loop with automatic test tracking and iteration history
 *
 * This is the implementation companion command that:
 * 1. Runs tests
 * 2. Tracks results with iteration history
 * 3. Shows what changed since last run
 * 4. Continues until all tests pass or max iterations reached
 *
 * Usage:
 *   specflow tdd              # Run tests once, track results
 *   specflow tdd --watch      # Watch mode with tracking
 *   specflow tdd --converge   # Loop until all tests pass
 *   specflow tdd --status     # Show current test status
 */

import { spawnSync, spawn } from "child_process";
import { existsSync, readFileSync, unlinkSync, watchFile, unwatchFile } from "fs";
import { join } from "path";
import {
  writeTestRun,
  readLatestTestRun,
  getTestRunHistory,
  getTestProgressSummary,
  parseJUnitXml,
  testResultsDir,
} from "../lib/test-tracker/artifacts";
import type { EnrichedTestRun } from "../lib/test-tracker/artifacts";

export interface TddCommandOptions {
  watch?: boolean;
  converge?: boolean;
  maxIterations?: number;
  status?: boolean;
  pattern?: string;
  verbose?: boolean;
}

function getGitInfo(): { sha?: string; branch?: string } {
  try {
    const shaResult = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
    const branchResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8" });
    return {
      sha: shaResult.stdout?.trim() || undefined,
      branch: branchResult.stdout?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

function formatDelta(delta: EnrichedTestRun["delta"]): string {
  if (!delta) return "";

  const parts: string[] = [];

  if (delta.passChange !== 0) {
    const sign = delta.passChange > 0 ? "+" : "";
    const color = delta.passChange > 0 ? "\x1b[32m" : "\x1b[31m";
    parts.push(`${color}${sign}${delta.passChange} pass\x1b[0m`);
  }
  if (delta.fixedTests.length > 0) {
    parts.push(`\x1b[32m${delta.fixedTests.length} fixed\x1b[0m`);
  }
  if (delta.brokenTests.length > 0) {
    parts.push(`\x1b[31m${delta.brokenTests.length} broken\x1b[0m`);
  }

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function runTestsOnce(projectPath: string, pattern?: string): EnrichedTestRun | null {
  const junitFile = join(testResultsDir(projectPath), "junit-latest.xml");

  const args = ["test", "--reporter=junit", `--reporter-outfile=${junitFile}`];
  if (pattern) {
    args.push(pattern);
  }

  const result = spawnSync("bun", args, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
    cwd: projectPath,
  });

  if (!existsSync(junitFile)) {
    console.error("\x1b[31mTest run failed - no JUnit output\x1b[0m");
    if (result.stderr) {
      console.error(result.stderr);
    }
    return null;
  }

  try {
    const xmlContent = readFileSync(junitFile, "utf-8");
    const gitInfo = getGitInfo();
    const testRun = parseJUnitXml(xmlContent, gitInfo.sha, gitInfo.branch);
    writeTestRun(projectPath, testRun);
    unlinkSync(junitFile);

    return readLatestTestRun(projectPath);
  } catch (error) {
    console.error("Failed to parse test results:", error);
    return null;
  }
}

function displayResult(run: EnrichedTestRun, verbose: boolean = false): void {
  const passRate = run.summary.total > 0
    ? ((run.summary.pass / run.summary.total) * 100).toFixed(1)
    : "0.0";
  const allPass = run.summary.fail === 0 && run.summary.skip === 0;
  const status = allPass ? "\x1b[32m✓ ALL PASS\x1b[0m" : "\x1b[33m○ IN PROGRESS\x1b[0m";
  const delta = formatDelta(run.delta);

  console.log(`\n${status} | Run #${run.iteration} | ${run.summary.pass}/${run.summary.total} (${passRate}%)${delta}`);

  if (verbose || run.summary.fail > 0) {
    // Show failed tests with IDs
    const failedTests = run.tests.filter((t) => t.status === "fail");
    if (failedTests.length > 0) {
      console.log(`\n\x1b[31mFailed tests:\x1b[0m`);
      for (const test of failedTests.slice(0, 10)) {
        console.log(`  ✗ \x1b[33m${test.id}\x1b[0m ${test.name}`);
        if (test.error && verbose) {
          console.log(`    ${test.error.split("\n")[0]}`);
        }
      }
      if (failedTests.length > 10) {
        console.log(`  ... and ${failedTests.length - 10} more`);
      }
    }
  }

  // Show fixed/broken with IDs
  if (run.delta) {
    if (run.delta.fixedTests.length > 0) {
      console.log(`\n\x1b[32mFixed since last run:\x1b[0m`);
      for (const testId of run.delta.fixedTests.slice(0, 5)) {
        const test = run.tests.find((t) => t.id === testId);
        console.log(`  + \x1b[33m${testId}\x1b[0m ${test?.name || ""}`);
      }
    }
    if (run.delta.brokenTests.length > 0) {
      console.log(`\n\x1b[31mBroken since last run:\x1b[0m`);
      for (const testId of run.delta.brokenTests.slice(0, 5)) {
        const test = run.tests.find((t) => t.id === testId);
        console.log(`  - \x1b[33m${testId}\x1b[0m ${test?.name || ""}`);
      }
    }
  }
}

function displayStatus(projectPath: string): void {
  const summary = getTestProgressSummary(projectPath);

  if (!summary) {
    console.log("\x1b[33mNo TDD iterations recorded yet.\x1b[0m");
    console.log("Run: specflow tdd");
    return;
  }

  console.log("\n\x1b[1m═══ TDD Progress ═══\x1b[0m\n");
  console.log(`Iterations: ${summary.totalRuns}`);

  if (summary.firstRun) {
    const firstRate = ((summary.firstRun.pass / (summary.firstRun.pass + summary.firstRun.fail)) * 100).toFixed(1);
    console.log(`Started:    ${summary.firstRun.pass}/${summary.firstRun.pass + summary.firstRun.fail} (${firstRate}%)`);
  }

  if (summary.latestRun) {
    const latestRate = ((summary.latestRun.pass / (summary.latestRun.pass + summary.latestRun.fail)) * 100).toFixed(1);
    const allPass = summary.latestRun.fail === 0;
    const status = allPass ? "\x1b[32m✓\x1b[0m" : "\x1b[33m○\x1b[0m";
    console.log(`Current:    ${status} ${summary.latestRun.pass}/${summary.latestRun.pass + summary.latestRun.fail} (${latestRate}%)`);
  }

  const trendColors: Record<string, string> = {
    improving: "\x1b[32m↑ improving\x1b[0m",
    regressing: "\x1b[31m↓ regressing\x1b[0m",
    stable: "\x1b[33m→ stable\x1b[0m",
    unknown: "\x1b[90m? unknown\x1b[0m",
  };
  console.log(`Trend:      ${trendColors[summary.trend]}`);

  // Show pass rate progression
  if (summary.passRateHistory.length > 1) {
    const sparkline = summary.passRateHistory
      .slice(-10)
      .map((r) => {
        if (r >= 100) return "\x1b[32m█\x1b[0m";
        if (r >= 80) return "\x1b[32m▇\x1b[0m";
        if (r >= 60) return "\x1b[33m▅\x1b[0m";
        if (r >= 40) return "\x1b[33m▃\x1b[0m";
        return "\x1b[31m▁\x1b[0m";
      })
      .join("");
    console.log(`Progress:   ${sparkline} ${summary.passRateHistory[summary.passRateHistory.length - 1].toFixed(0)}%`);
  }

  if (summary.flakyTests.length > 0) {
    console.log(`\n\x1b[33mFlaky tests (toggled 2+ times):\x1b[0m`);
    for (const test of summary.flakyTests.slice(0, 5)) {
      console.log(`  ⚡ ${test}`);
    }
  }

  // Check if converged
  if (summary.latestRun && summary.latestRun.fail === 0) {
    console.log(`\n\x1b[32m✓ CONVERGED - All tests passing!\x1b[0m`);
  } else if (summary.latestRun) {
    console.log(`\n\x1b[33m○ ${summary.latestRun.fail} tests remaining\x1b[0m`);
  }
}

export async function tddCommand(options: TddCommandOptions = {}): Promise<void> {
  const projectPath = process.cwd();

  // Show status only
  if (options.status) {
    displayStatus(projectPath);
    return;
  }

  // Converge mode: loop until all tests pass
  if (options.converge) {
    const maxIterations = options.maxIterations || 50;
    console.log(`\x1b[1m═══ TDD Converge Mode ═══\x1b[0m`);
    console.log(`Max iterations: ${maxIterations}`);
    console.log(`Pattern: ${options.pattern || "all tests"}`);
    console.log("");

    for (let i = 0; i < maxIterations; i++) {
      console.log(`\x1b[90m─── Iteration ${i + 1}/${maxIterations} ───\x1b[0m`);

      const result = runTestsOnce(projectPath, options.pattern);
      if (!result) {
        console.error("Test run failed, stopping.");
        process.exit(1);
      }

      displayResult(result, options.verbose);

      // Check for convergence
      if (result.summary.fail === 0 && result.summary.skip === 0) {
        console.log(`\n\x1b[32m═══ CONVERGED in ${i + 1} iterations! ═══\x1b[0m`);
        displayStatus(projectPath);
        return;
      }

      // If no progress, warn
      if (result.delta && result.delta.fixedTests.length === 0 && result.delta.brokenTests.length === 0) {
        console.log("\n\x1b[33mNo change detected. Make fixes and press Enter to continue, or Ctrl+C to exit.\x1b[0m");
        await new Promise<void>((resolve) => {
          process.stdin.once("data", () => resolve());
        });
      }
    }

    console.log(`\n\x1b[31mMax iterations (${maxIterations}) reached without convergence.\x1b[0m`);
    displayStatus(projectPath);
    process.exit(1);
  }

  // Single run mode (default)
  console.log("\x1b[1m═══ TDD Run ═══\x1b[0m");

  const result = runTestsOnce(projectPath, options.pattern);
  if (!result) {
    process.exit(1);
  }

  displayResult(result, options.verbose);

  // Show suggestion
  if (result.summary.fail > 0) {
    console.log(`\n\x1b[90mFix failures and run 'specflow tdd' again to track progress.\x1b[0m`);
    console.log(`\x1b[90mOr use 'specflow tdd --converge' for interactive loop.\x1b[0m`);
  }
}
