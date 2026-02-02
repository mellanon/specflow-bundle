/**
 * Hook Executor Module
 * Executes phase hooks (pre/post) with environment injection and timeout
 */

import { spawn } from "child_process";
import type { NormalizedHookEntry, HookResult, HookBatchResult } from "../types";

/**
 * Build the environment variables for hook execution.
 * Merges process.env with SPECFLOW_* variables.
 */
export function buildHookEnv(
  featureId: string,
  phase: string,
  projectPath: string,
  phaseStatus?: string
): Record<string, string> {
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    SPECFLOW_FEATURE_ID: featureId,
    SPECFLOW_PHASE: phase,
    SPECFLOW_PROJECT_PATH: projectPath,
  };

  if (phaseStatus) {
    env.SPECFLOW_PHASE_STATUS = phaseStatus;
  }

  return env;
}

/**
 * Execute a single hook command.
 * Never throws -- always returns a HookResult.
 */
export async function executeHook(
  entry: NormalizedHookEntry,
  env: Record<string, string>,
  options?: { cwd?: string }
): Promise<HookResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let resolved = false;

    const proc = spawn("sh", ["-c", entry.command], {
      cwd: options?.cwd || process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, entry.timeout * 1000);

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const finish = (exitCode: number | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        command: entry.command,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
      });
    };

    proc.on("close", (code) => finish(code));
    proc.on("error", (err) => {
      stderr += err.message;
      finish(null);
    });
  });
}

/**
 * Execute multiple hooks sequentially.
 * For position "pre": stops on first non-zero exit.
 * For position "post": runs all hooks regardless of failures.
 */
export async function executeHooks(
  entries: NormalizedHookEntry[],
  env: Record<string, string>,
  options: { position: "pre" | "post"; cwd: string }
): Promise<HookBatchResult> {
  const results: HookResult[] = [];

  for (let i = 0; i < entries.length; i++) {
    const result = await executeHook(entries[i], env, { cwd: options.cwd });
    results.push(result);

    const failed = result.exitCode !== 0 || result.timedOut;

    if (options.position === "pre" && failed) {
      return {
        success: false,
        results,
        abortedAtIndex: i,
      };
    }

    if (options.position === "post" && failed) {
      console.warn(
        `[specflow:hooks] Post-hook failed (exit ${result.exitCode}): ${result.command}`
      );
    }
  }

  return {
    success: true,
    results,
  };
}
