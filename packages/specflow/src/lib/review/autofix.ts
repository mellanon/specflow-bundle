/**
 * Review Autofix — attempts AI-driven fixes for review failures.
 * Uses headless Claude to analyze findings and generate fixes.
 */

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// =============================================================================
// Types
// =============================================================================

export interface AutofixResult {
  featureId: string;
  attempted: boolean;
  fixed: boolean;
  changes: { file: string; description: string }[];
  error?: string;
}

// =============================================================================
// Autofix Entry Point
// =============================================================================

export async function attemptAutofix(
  featureId: string,
  specPath: string,
  projectPath: string,
  findings: { severity: string; area: string; description: string }[],
  alignment: { missing: string[] }
): Promise<AutofixResult> {
  // Only attempt if there are actionable findings
  const actionable = findings.filter(
    (f) => f.severity === "critical" || f.severity === "warning"
  );

  if (actionable.length === 0 && alignment.missing.length === 0) {
    return { featureId, attempted: false, fixed: false, changes: [] };
  }

  // Read the spec for context
  const specFile = join(specPath, "spec.md");
  const specContent = existsSync(specFile)
    ? readFileSync(specFile, "utf-8").substring(0, 6000)
    : "";

  const prompt = buildAutofixPrompt(
    featureId,
    specContent,
    findings,
    alignment.missing,
    projectPath
  );

  try {
    const output = await runClaudeForAutofix(prompt, projectPath);
    const changes = parseAutofixOutput(output);

    return {
      featureId,
      attempted: true,
      fixed: changes.length > 0,
      changes,
    };
  } catch (err) {
    return {
      featureId,
      attempted: true,
      fixed: false,
      changes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// =============================================================================
// Prompt Builder
// =============================================================================

function buildAutofixPrompt(
  featureId: string,
  specContent: string,
  findings: { severity: string; area: string; description: string }[],
  missingFiles: string[],
  projectPath: string
): string {
  const actionable = findings.filter(
    (f) => f.severity === "critical" || f.severity === "warning"
  );

  let findingsBlock = "";
  if (actionable.length > 0) {
    findingsBlock = actionable
      .map((f) => `- [${f.severity.toUpperCase()}] ${f.area}: ${f.description}`)
      .join("\n");
  }

  let missingBlock = "";
  if (missingFiles.length > 0) {
    missingBlock = `\nMissing files referenced in spec:\n${missingFiles.map((f) => `- ${f}`).join("\n")}`;
  }

  return `You are fixing code for feature ${featureId} to align with its specification.

## Specification
${specContent}

## Review Findings (fix these)
${findingsBlock || "No specific findings."}
${missingBlock}

## Instructions
1. Read the relevant source files in this project.
2. Fix the code to address each finding above.
3. Focus on critical and warning findings only.
4. Make minimal, targeted changes.
5. After making changes, output a summary of what you changed.

Output your summary as JSON lines, one per file changed:
{"file": "path/to/file.ts", "description": "what was changed"}

Only output the JSON lines at the very end, after completing all fixes.`;
}

// =============================================================================
// Claude Runner (agent mode for actual file changes)
// =============================================================================

function runClaudeForAutofix(prompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      ["--dangerously-skip-permissions", "--output-format", "json", "-p", prompt],
      {
        cwd,
        stdio: ["inherit", "pipe", "pipe"],
        timeout: 120000,
      }
    );

    let output = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && output.length === 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr.substring(0, 200)}`));
      } else {
        resolve(output.trim());
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

// =============================================================================
// Output Parser
// =============================================================================

function parseAutofixOutput(output: string): { file: string; description: string }[] {
  const changes: { file: string; description: string }[] = [];

  // Try to parse as JSON envelope first (--output-format json wraps result)
  let text = output;
  try {
    const envelope = JSON.parse(output);
    if (typeof envelope.result === "string") {
      text = envelope.result;
    } else if (typeof envelope.text === "string") {
      text = envelope.text;
    }
  } catch {
    // Not a JSON envelope, use raw output
  }

  // Extract JSON lines from the output
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{") && trimmed.includes('"file"')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.file && parsed.description) {
          changes.push({ file: parsed.file, description: parsed.description });
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  return changes;
}
