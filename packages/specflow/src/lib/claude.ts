/**
 * Claude CLI Subprocess Utility
 *
 * Shared utility for running Claude as a headless subprocess.
 * Follows the "claude -p Inference Pattern" from PAI vault:
 * - --system-prompt override to prevent hook contamination (Algorithm format, voice lines)
 * - Timeout handling via Promise.race + proc.kill
 * - --dangerously-skip-permissions for tool access (file writes)
 *
 * Reference: ~/Documents/andreas_brain/2026-02-02-claude -p Inference Pattern-1454.md
 */

import { spawn, type ChildProcess } from "child_process";

// =============================================================================
// Types
// =============================================================================

export interface RunClaudeOptions {
  /** Working directory for the subprocess */
  cwd: string;
  /** Timeout in milliseconds (default: 600000 = 10 minutes) */
  timeout?: number;
  /** Whether to pipe stdout to the parent process (default: true) */
  pipeOutput?: boolean;
  /** Custom system prompt override. If not provided, uses the default SpecFlow system prompt */
  systemPrompt?: string;
  /** Model to use (default: inherits from environment) */
  model?: string;
}

export interface RunClaudeResult {
  success: boolean;
  output: string;
  error?: string;
  timedOut?: boolean;
}

// =============================================================================
// Default System Prompt
// =============================================================================

/**
 * Default system prompt for SpecFlow subprocess invocations.
 * This override prevents PAI hooks from injecting Algorithm formatting,
 * voice notifications, and other context that corrupts spec output.
 */
export const SPECFLOW_SYSTEM_PROMPT = `You are a SpecFlow specification writer. Your sole purpose is to follow the prompt instructions exactly and write the requested files.

CRITICAL RULES:
- Do NOT use any special formatting (no 🤖 PAI ALGORITHM headers, no phase announcements)
- Do NOT trigger voice notifications or curl commands
- Do NOT create ISC criteria or task lists
- Do NOT run "the Algorithm"
- Write files directly using the Write tool
- Output [PHASE COMPLETE: ...] when done, as specified in the prompt
- Be concise and focused on the deliverable`;

// =============================================================================
// Core Function
// =============================================================================

/**
 * Run Claude CLI as a headless subprocess with proper isolation.
 *
 * Applies the claude -p Inference Pattern:
 * 1. --system-prompt to override PAI hook contamination
 * 2. Timeout handling to prevent hangs
 * 3. --dangerously-skip-permissions for file write access
 */
export async function runClaude(
  prompt: string,
  options: RunClaudeOptions
): Promise<RunClaudeResult> {
  const {
    cwd,
    timeout = 600_000,
    pipeOutput = true,
    systemPrompt = SPECFLOW_SYSTEM_PROMPT,
    model,
  } = options;

  // Build CLI arguments following the inference pattern
  const args: string[] = [
    "--print",
    "--dangerously-skip-permissions",
    "--system-prompt",
    systemPrompt,
  ];

  if (model) {
    args.push("--model", model);
  }

  args.push(prompt);

  return new Promise((resolve) => {
    let proc: ChildProcess;
    let output = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    // Timeout handler
    const timer = setTimeout(() => {
      if (!settled) {
        timedOut = true;
        proc?.kill("SIGTERM");
        // Force kill after 5s if SIGTERM doesn't work
        setTimeout(() => {
          try {
            proc?.kill("SIGKILL");
          } catch {
            // Process may already be dead
          }
        }, 5000);
      }
    }, timeout);

    proc = spawn("claude", args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    proc.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      output += chunk;
      if (pipeOutput) {
        process.stdout.write(chunk);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (pipeOutput) {
        process.stderr.write(chunk);
      }
    });

    proc.on("close", (code: number | null) => {
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          success: false,
          output,
          error: `Claude process timed out after ${Math.round(timeout / 1000)}s`,
          timedOut: true,
        });
      } else if (code === 0 || output.includes("[PHASE COMPLETE")) {
        resolve({ success: true, output });
      } else {
        resolve({
          success: false,
          output,
          error: stderr || `Claude exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err: Error) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        success: false,
        output,
        error: `Process error: ${err.message}`,
      });
    });
  });
}
