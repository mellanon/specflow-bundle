/**
 * Executor Module
 * Executes Claude subprocess for feature implementation
 * Includes automatic test tracking for TDD iterations
 */

import { spawn, spawnSync } from "child_process";
import type { RunResult, FeatureContext } from "../types";
import { writeTestRun, type TestRunResult } from "./test-tracker/artifacts";

// =============================================================================
// Completion Detection
// =============================================================================

export interface CompletionResult {
  complete: boolean;
  blocked: boolean;
  featureId: string | null;
  blockReason: string | null;
  testsCount: number | null;
  files: string[];
}

/**
 * Extract and save test results from Claude's output
 * Looks for patterns like "Tests: 200 passing" or "✓ 150 pass, ✗ 3 fail"
 */
export function extractAndSaveTestResults(
  output: string,
  projectPath: string,
  featureId: string
): { saved: boolean; pass: number; fail: number } {
  // Try multiple patterns Claude might use
  const patterns = [
    /(\d+)\s*(?:tests?\s+)?pass(?:ing)?(?:,?\s*(\d+)\s*fail)?/i,
    /Tests?:\s*(\d+)(?:\s*pass(?:ing)?)?(?:,?\s*(\d+)\s*fail)?/i,
    /✓\s*(\d+)\s*pass.*?(?:✗\s*(\d+)\s*fail)?/i,
    /(\d+)\/(\d+)\s*(?:tests?\s+)?pass/i, // "150/200 tests pass" format
  ];

  let pass = 0;
  let fail = 0;
  let matched = false;

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      if (pattern.source.includes("/")) {
        // "150/200" format - first is pass, second is total
        pass = parseInt(match[1], 10);
        fail = parseInt(match[2], 10) - pass;
      } else {
        pass = parseInt(match[1], 10) || 0;
        fail = parseInt(match[2], 10) || 0;
      }
      matched = true;
      break;
    }
  }

  if (!matched || pass === 0) {
    return { saved: false, pass: 0, fail: 0 };
  }

  // Get git info
  let gitSha: string | undefined;
  let branch: string | undefined;
  try {
    const shaResult = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8", cwd: projectPath });
    const branchResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8", cwd: projectPath });
    gitSha = shaResult.stdout?.trim();
    branch = branchResult.stdout?.trim();
  } catch {
    // Ignore git errors
  }

  // Create test run result
  const testRun: TestRunResult = {
    runAt: new Date().toISOString(),
    duration: 0, // Unknown from output
    tests: [], // Individual tests not available from summary
    summary: {
      total: pass + fail,
      pass,
      fail,
      skip: 0,
    },
    gitSha,
    branch,
  };

  try {
    writeTestRun(projectPath, testRun);
    return { saved: true, pass, fail };
  } catch {
    return { saved: false, pass, fail };
  }
}

/**
 * Parse output for completion markers
 */
export function parseCompletionMarkers(output: string): CompletionResult {
  const result: CompletionResult = {
    complete: false,
    blocked: false,
    featureId: null,
    blockReason: null,
    testsCount: null,
    files: [],
  };

  // Check for completion marker
  if (detectCompletion(output)) {
    result.complete = true;

    // Extract feature ID
    const featureMatch = output.match(/Feature:\s*(F-\d+)/i);
    if (featureMatch) {
      result.featureId = featureMatch[1];
    }

    // Extract tests count
    const testsMatch = output.match(/Tests:\s*(\d+)/i);
    if (testsMatch) {
      result.testsCount = parseInt(testsMatch[1]);
    }

    // Extract files
    const filesMatch = output.match(/Files:\s*(.+)/i);
    if (filesMatch) {
      result.files = filesMatch[1].split(",").map((f) => f.trim());
    }
  }

  // Check for blocked marker
  if (detectBlocked(output)) {
    result.blocked = true;
    result.complete = false;

    // Extract feature ID
    const featureMatch = output.match(/Feature:\s*(F-\d+)/i);
    if (featureMatch) {
      result.featureId = featureMatch[1];
    }

    // Extract reason
    const reasonMatch = output.match(/Reason:\s*(.+)/i);
    if (reasonMatch) {
      result.blockReason = reasonMatch[1].trim();
    }
  }

  return result;
}

/**
 * Check if output contains completion marker
 */
export function detectCompletion(output: string): boolean {
  return /\[FEATURE COMPLETE\]/i.test(output);
}

/**
 * Check if output contains blocked marker
 */
export function detectBlocked(output: string): boolean {
  return /\[FEATURE BLOCKED\]/i.test(output);
}

// =============================================================================
// Execution
// =============================================================================

export interface ExecuteOptions {
  timeout?: number; // in milliseconds
  dryRun?: boolean;
}

/**
 * Execute Claude to implement a feature
 */
export async function executeFeature(
  context: FeatureContext,
  prompt: string,
  options: ExecuteOptions = {}
): Promise<RunResult> {
  const { timeout = 10 * 60 * 1000, dryRun = false } = options; // 10 minute default

  if (dryRun) {
    return {
      success: false,
      featureId: context.feature.id,
      output: "[DRY RUN] Would execute Claude with the provided prompt",
      error: null,
      blocked: false,
      blockReason: null,
    };
  }

  try {
    // Execute Claude CLI
    const result = spawnSync("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout,
      cwd: context.app.projectPath,
    });

    const output = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    // Check for execution errors
    if (result.status !== 0 && !output) {
      return {
        success: false,
        featureId: context.feature.id,
        output: stderr,
        error: `Claude exited with status ${result.status}`,
        blocked: false,
        blockReason: null,
      };
    }

    // Parse completion markers
    const completion = parseCompletionMarkers(output);

    // Track test results for TDD traceability
    const testResults = extractAndSaveTestResults(output, context.app.projectPath, context.feature.id);
    if (testResults.saved) {
      console.error(`\x1b[90m[TDD Track] Saved: ${testResults.pass} pass, ${testResults.fail} fail\x1b[0m`);
    }

    if (completion.blocked) {
      return {
        success: false,
        featureId: context.feature.id,
        output,
        error: null,
        blocked: true,
        blockReason: completion.blockReason,
      };
    }

    if (completion.complete) {
      return {
        success: true,
        featureId: context.feature.id,
        output,
        error: null,
        blocked: false,
        blockReason: null,
      };
    }

    // No completion marker found - treat as incomplete
    return {
      success: false,
      featureId: context.feature.id,
      output,
      error: "No completion marker found in output",
      blocked: false,
      blockReason: null,
    };
  } catch (error) {
    return {
      success: false,
      featureId: context.feature.id,
      output: "",
      error: `Execution failed: ${error}`,
      blocked: false,
      blockReason: null,
    };
  }
}

/**
 * Execute with streaming output
 */
export function executeFeatureStreaming(
  context: FeatureContext,
  prompt: string,
  onOutput: (chunk: string) => void,
  options: ExecuteOptions = {}
): Promise<RunResult> {
  const { timeout = 10 * 60 * 1000, dryRun = false } = options;

  if (dryRun) {
    onOutput("[DRY RUN] Would execute Claude with the provided prompt\n");
    return Promise.resolve({
      success: false,
      featureId: context.feature.id,
      output: "[DRY RUN]",
      error: null,
      blocked: false,
      blockReason: null,
    });
  }

  return new Promise((resolve) => {
    const proc = spawn("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      cwd: context.app.projectPath,
    });

    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      onOutput(chunk);
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      onOutput(chunk);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          success: false,
          featureId: context.feature.id,
          output,
          error: "Execution timed out",
          blocked: false,
          blockReason: null,
        });
        return;
      }

      const completion = parseCompletionMarkers(output);

      // Track test results for TDD traceability
      const testResults = extractAndSaveTestResults(output, context.app.projectPath, context.feature.id);
      if (testResults.saved) {
        onOutput(`\x1b[90m[TDD Track] Saved: ${testResults.pass} pass, ${testResults.fail} fail\x1b[0m\n`);
      }

      if (completion.blocked) {
        resolve({
          success: false,
          featureId: context.feature.id,
          output,
          error: null,
          blocked: true,
          blockReason: completion.blockReason,
        });
        return;
      }

      if (completion.complete) {
        resolve({
          success: true,
          featureId: context.feature.id,
          output,
          error: null,
          blocked: false,
          blockReason: null,
        });
        return;
      }

      resolve({
        success: false,
        featureId: context.feature.id,
        output,
        error: code !== 0 ? `Claude exited with status ${code}` : "No completion marker",
        blocked: false,
        blockReason: null,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        featureId: context.feature.id,
        output,
        error: `Process error: ${err.message}`,
        blocked: false,
        blockReason: null,
      });
    });
  });
}
