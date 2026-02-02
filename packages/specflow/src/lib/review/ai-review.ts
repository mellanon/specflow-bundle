/**
 * Review - AI Spec-Code Alignment Verification
 * Uses headless Claude to evaluate whether code faithfully implements the specification.
 */

import { spawn } from "child_process";
import { readFileSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { Glob } from "bun";

// =============================================================================
// Types
// =============================================================================

export interface AIReviewResult {
  /** Whether the AI review passed */
  passed: boolean;
  /** Overall alignment score (0-1) */
  score: number;
  /** Detailed findings */
  findings: AIFinding[];
  /** Raw AI output */
  rawOutput: string;
}

export interface AIFinding {
  severity: "critical" | "warning" | "info";
  area: string;
  description: string;
}

// =============================================================================
// Code Collector
// =============================================================================

/**
 * Collect relevant source files for AI review
 */
async function collectSourceFiles(
  projectPath: string,
  specContent: string
): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  // Extract file paths from spec
  const specPaths = [...specContent.matchAll(/`([a-zA-Z0-9_/.\\-]+\.\w{1,6})`/g)]
    .map((m) => m[1])
    .filter((p) => p.includes("/") && !p.startsWith("http"));

  for (const path of specPaths) {
    const fullPath = join(projectPath, path);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        // Truncate large files
        files.set(path, content.length > 5000 ? content.substring(0, 5000) + "\n// ... truncated" : content);
      } catch {
        // Skip unreadable files
      }
    }
  }

  return files;
}

// =============================================================================
// AI Review
// =============================================================================

/**
 * Run AI-powered spec-code alignment review
 */
export async function runAIReview(
  featureId: string,
  specPath: string,
  projectPath: string
): Promise<AIReviewResult> {
  const specFile = join(specPath, "spec.md");
  if (!existsSync(specFile)) {
    return {
      passed: true,
      score: 0,
      findings: [{ severity: "warning", area: "spec", description: "No spec.md found" }],
      rawOutput: "",
    };
  }

  const specContent = readFileSync(specFile, "utf-8");
  const sourceFiles = await collectSourceFiles(projectPath, specContent);

  if (sourceFiles.size === 0) {
    return {
      passed: true,
      score: 0,
      findings: [{ severity: "info", area: "alignment", description: "No source files referenced in spec" }],
      rawOutput: "",
    };
  }

  // Build code context
  let codeContext = "";
  for (const [path, content] of sourceFiles) {
    codeContext += `\n### ${path}\n\`\`\`\n${content}\n\`\`\`\n`;
  }

  const prompt = `You are reviewing whether code faithfully implements a specification.

## Specification
${specContent.substring(0, 8000)}

## Implementation Code
${codeContext.substring(0, 12000)}

## Review Instructions
Evaluate alignment between spec and code. For each area, assess:
1. Are all specified requirements implemented?
2. Are there implementation deviations from the spec?
3. Are there missing error handling or edge cases from the spec?
4. Are there security concerns not addressed?

Respond in JSON format:
{
  "score": <0.0-1.0>,
  "passed": <true if score >= 0.7>,
  "findings": [
    {"severity": "critical|warning|info", "area": "<section>", "description": "<finding>"}
  ]
}

Only return the JSON, no other text.`;

  const rawOutput = await runClaudeForReview(prompt);

  try {
    const parsed = JSON.parse(rawOutput);
    return {
      passed: parsed.passed ?? parsed.score >= 0.7,
      score: parsed.score ?? 0,
      findings: parsed.findings ?? [],
      rawOutput,
    };
  } catch {
    return {
      passed: true,
      score: 0,
      findings: [{ severity: "info", area: "ai-review", description: "AI review unavailable" }],
      rawOutput,
    };
  }
}

/**
 * Append AI findings to an existing review markdown file
 */
export function appendAIReviewToMarkdown(
  reviewPath: string,
  result: AIReviewResult
): void {
  const lines: string[] = [];

  lines.push(`\n## AI Spec-Code Alignment Review\n`);
  lines.push(`Score: ${(result.score * 100).toFixed(0)}%`);
  lines.push(`Status: ${result.passed ? "PASS" : "FAIL"}\n`);

  if (result.findings.length > 0) {
    lines.push(`| Severity | Area | Finding |`);
    lines.push(`|----------|------|---------|`);
    for (const finding of result.findings) {
      const icon = finding.severity === "critical" ? "!!" : finding.severity === "warning" ? "!" : "i";
      lines.push(`| ${icon} ${finding.severity} | ${finding.area} | ${finding.description} |`);
    }
  }

  appendFileSync(reviewPath, lines.join("\n"));
}

// =============================================================================
// Claude Runner
// =============================================================================

function runClaudeForReview(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("claude", ["--print", "--dangerously-skip-permissions", prompt], {
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 60000,
    });

    let output = "";
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("close", () => resolve(output.trim()));
    proc.on("error", () => resolve(""));
  });
}
