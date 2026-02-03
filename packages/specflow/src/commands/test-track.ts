/**
 * Test Track Command
 * Track unit test results with traceability across iterations
 *
 * Usage:
 *   bun test --json 2>&1 | specflow test-track
 *   specflow test-track --status
 *   specflow test-track --history
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import {
  writeTestRun,
  readLatestTestRun,
  getTestRunHistory,
  getTestProgressSummary,
  parseJUnitXml,
  parseBunTextOutput,
} from "../lib/test-tracker/artifacts";
import type { TestRunResult } from "../lib/test-tracker/artifacts";

interface TestTrackOptions {
  status?: boolean;
  history?: boolean;
  limit?: number;
  run?: boolean;
  json?: boolean;
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

function formatDelta(delta: NonNullable<ReturnType<typeof readLatestTestRun>>["delta"]): string {
  if (!delta) return "";

  const parts: string[] = [];

  if (delta.passChange !== 0) {
    const sign = delta.passChange > 0 ? "+" : "";
    parts.push(`${sign}${delta.passChange} pass`);
  }
  if (delta.failChange !== 0) {
    const sign = delta.failChange > 0 ? "+" : "";
    parts.push(`${sign}${delta.failChange} fail`);
  }
  if (delta.fixedTests.length > 0) {
    parts.push(`\x1b[32m${delta.fixedTests.length} fixed\x1b[0m`);
  }
  if (delta.brokenTests.length > 0) {
    parts.push(`\x1b[31m${delta.brokenTests.length} broken\x1b[0m`);
  }

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export async function testTrackCommand(options: TestTrackOptions): Promise<void> {
  const projectPath = process.cwd();

  // Show test progress summary
  if (options.status) {
    const summary = getTestProgressSummary(projectPath);

    if (!summary) {
      console.log("\x1b[33mNo test runs recorded yet.\x1b[0m");
      console.log("Run: bun test --json 2>&1 | specflow test-track");
      return;
    }

    console.log("\n\x1b[1mTest Progress Summary\x1b[0m\n");
    console.log(`Total runs: ${summary.totalRuns}`);

    if (summary.firstRun) {
      console.log(`First run:  ${summary.firstRun.date.slice(0, 10)} - ${summary.firstRun.pass}/${summary.firstRun.pass + summary.firstRun.fail} passing`);
    }
    if (summary.latestRun) {
      const passRate = ((summary.latestRun.pass / (summary.latestRun.pass + summary.latestRun.fail)) * 100).toFixed(1);
      console.log(`Latest:     ${summary.latestRun.date.slice(0, 10)} - ${summary.latestRun.pass}/${summary.latestRun.pass + summary.latestRun.fail} passing (${passRate}%)`);
    }

    const trendColors: Record<string, string> = {
      improving: "\x1b[32m",
      regressing: "\x1b[31m",
      stable: "\x1b[33m",
      unknown: "\x1b[90m",
    };
    console.log(`Trend:      ${trendColors[summary.trend]}${summary.trend}\x1b[0m`);

    if (summary.flakyTests.length > 0) {
      console.log(`\n\x1b[33mFlaky tests (toggled 2+ times):\x1b[0m`);
      for (const test of summary.flakyTests.slice(0, 5)) {
        console.log(`  - ${test}`);
      }
      if (summary.flakyTests.length > 5) {
        console.log(`  ... and ${summary.flakyTests.length - 5} more`);
      }
    }

    // Show pass rate sparkline
    if (summary.passRateHistory.length > 1) {
      console.log(`\nPass rate history: ${summary.passRateHistory.map((r) => r.toFixed(0) + "%").join(" → ")}`);
    }

    if (options.json) {
      console.log("\n" + JSON.stringify(summary, null, 2));
    }
    return;
  }

  // Show test history
  if (options.history) {
    const history = getTestRunHistory(projectPath);
    const limit = options.limit || 10;

    if (history.length === 0) {
      console.log("\x1b[33mNo test runs recorded yet.\x1b[0m");
      return;
    }

    console.log("\n\x1b[1mTest Run History\x1b[0m\n");

    const recentRuns = history.slice(-limit);
    for (const run of recentRuns) {
      const passRate = ((run.summary.pass / run.summary.total) * 100).toFixed(1);
      const status = run.summary.fail === 0 ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const delta = formatDelta(run.delta);

      console.log(
        `${status} Run #${run.iteration} | ${run.runAt.slice(0, 16).replace("T", " ")} | ` +
          `${run.summary.pass}/${run.summary.total} (${passRate}%)${delta}`
      );
    }

    if (history.length > limit) {
      console.log(`\n... ${history.length - limit} earlier runs not shown`);
    }

    if (options.json) {
      console.log("\n" + JSON.stringify(recentRuns, null, 2));
    }
    return;
  }

  // Run tests and capture results using JUnit XML format
  if (options.run) {
    console.log("Running tests with traceability...\n");

    const junitFile = join(projectPath, ".specify", "tests", "junit-latest.xml");

    const result = spawnSync("bun", ["test", "--reporter=junit", `--reporter-outfile=${junitFile}`], {
      encoding: "utf-8",
      stdio: ["inherit", "pipe", "pipe"],
    });

    // Parse JUnit XML and save results
    try {
      if (!existsSync(junitFile)) {
        console.error("JUnit output file not created. Test run may have failed.");
        console.log(result.stderr);
        return;
      }

      const xmlContent = readFileSync(junitFile, "utf-8");
      const gitInfo = getGitInfo();
      const testRun = parseJUnitXml(xmlContent, gitInfo.sha, gitInfo.branch);
      const savedPath = writeTestRun(projectPath, testRun);

      // Clean up JUnit file
      unlinkSync(junitFile);

      // Show summary
      const latest = readLatestTestRun(projectPath);
      if (latest) {
        const passRate = latest.summary.total > 0
          ? ((latest.summary.pass / latest.summary.total) * 100).toFixed(1)
          : "0.0";
        const status = latest.summary.fail === 0 ? "\x1b[32m✓ PASS\x1b[0m" : "\x1b[31m✗ FAIL\x1b[0m";
        const delta = formatDelta(latest.delta);

        console.log(`\n${status} | ${latest.summary.pass}/${latest.summary.total} (${passRate}%)${delta}`);
        console.log(`\x1b[90mRun #${latest.iteration} saved to ${savedPath}\x1b[0m`);
      }
    } catch (error) {
      console.error("Failed to parse test output:", error);
      console.log("\nRaw stderr:");
      console.log(result.stderr);
    }
    return;
  }

  // Default: read from stdin (piped from bun test --json)
  let input = "";
  for await (const chunk of Bun.stdin.stream()) {
    input += new TextDecoder().decode(chunk);
  }

  if (!input.trim()) {
    console.log("\x1b[33mNo input received.\x1b[0m");
    console.log("Usage:");
    console.log("  bun test --json 2>&1 | specflow test-track");
    console.log("  specflow test-track --run");
    console.log("  specflow test-track --status");
    console.log("  specflow test-track --history");
    return;
  }

  // Try to parse the input - detect format (JUnit XML or plain text)
  try {
    const gitInfo = getGitInfo();
    let testRun: TestRunResult;

    if (input.trim().startsWith("<?xml") || input.includes("<testsuites")) {
      // JUnit XML format
      testRun = parseJUnitXml(input, gitInfo.sha, gitInfo.branch);
    } else {
      // Plain text format (bun test default output)
      testRun = parseBunTextOutput(input, gitInfo.sha, gitInfo.branch);
    }

    const savedPath = writeTestRun(projectPath, testRun);

    const latest = readLatestTestRun(projectPath);
    if (latest) {
      const passRate = latest.summary.total > 0
        ? ((latest.summary.pass / latest.summary.total) * 100).toFixed(1)
        : "0.0";
      const status = latest.summary.fail === 0 ? "\x1b[32m✓ PASS\x1b[0m" : "\x1b[31m✗ FAIL\x1b[0m";
      const delta = formatDelta(latest.delta);

      console.log(`${status} | ${latest.summary.pass}/${latest.summary.total} (${passRate}%)${delta}`);
      console.log(`\x1b[90mRun #${latest.iteration} saved to ${savedPath}\x1b[0m`);

      // Show details for failed/fixed/broken tests
      if (latest.delta) {
        if (latest.delta.fixedTests.length > 0) {
          console.log(`\n\x1b[32mFixed tests:\x1b[0m`);
          for (const test of latest.delta.fixedTests.slice(0, 5)) {
            console.log(`  + ${test}`);
          }
        }
        if (latest.delta.brokenTests.length > 0) {
          console.log(`\n\x1b[31mBroken tests:\x1b[0m`);
          for (const test of latest.delta.brokenTests.slice(0, 5)) {
            console.log(`  - ${test}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("Failed to parse test output:", error);
    console.log("\nReceived input:");
    console.log(input.slice(0, 500) + (input.length > 500 ? "..." : ""));
  }
}
