/**
 * Headless Harden Evaluator
 * Uses claude -p to autonomously evaluate test cases against the codebase
 */

import { spawnSync } from "child_process";
import { join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import type { HardenTestCase } from "../../types";

export interface HeadlessVerdict {
  status: "pass" | "fail" | "skip";
  evidence: string;
  notes: string | null;
}

/**
 * Evaluate a single test case using headless Claude
 */
export function evaluateTestCase(
  projectPath: string,
  featureId: string,
  specPath: string,
  testCase: HardenTestCase
): HeadlessVerdict {
  // Build context: gather relevant source files
  const context = buildEvalContext(projectPath, specPath, testCase);

  const prompt = `You are a QA engineer validating a SpecFlow feature implementation.

## Feature: ${featureId}

## Test Case: ${testCase.id}
- **Description:** ${testCase.description}
- **Source:** ${testCase.source}
- **Type:** ${testCase.type}
${testCase.preconditions.length > 0 ? `- **Preconditions:** ${testCase.preconditions.join("; ")}` : ""}
- **Steps:**
${testCase.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
- **Expected Result:** ${testCase.expectedResult}

## Relevant Source Code
${context}

## Instructions
Evaluate whether the implementation satisfies this test case. Respond with EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):

{"status": "pass" or "fail", "evidence": "specific file:line references and code that proves the verdict", "notes": "any additional observations or null"}

If you cannot determine the verdict from the provided code, use "skip" status with explanation in notes.`;

  const result = spawnSync("claude", ["-p", prompt, "--output-format", "json"], {
    cwd: projectPath,
    timeout: 60000,
    encoding: "utf-8",
    env: { ...process.env },
  });

  if (result.error || result.status !== 0) {
    return {
      status: "skip",
      evidence: "Headless evaluation failed",
      notes: result.stderr?.slice(0, 500) || "Unknown error",
    };
  }

  const output = result.stdout.trim();

  try {
    // Parse Claude's response - it may be wrapped in the JSON output format
    const parsed = parseClaudeResponse(output);
    return {
      status: parsed.status === "pass" ? "pass" : parsed.status === "fail" ? "fail" : "skip",
      evidence: parsed.evidence || "No evidence provided",
      notes: parsed.notes || null,
    };
  } catch {
    return {
      status: "skip",
      evidence: "Could not parse headless evaluation response",
      notes: output?.slice(0, 500) || null,
    };
  }
}

function parseClaudeResponse(output: string): any {
  // Claude with --output-format json wraps in {"type":"result","result":"..."}
  try {
    const wrapper = JSON.parse(output);
    if (wrapper.result) {
      // The result field contains Claude's text response
      const text = wrapper.result;
      // Find JSON in the text
      const jsonMatch = text.match(/\{[\s\S]*"status"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      // If the whole result is JSON
      return JSON.parse(text);
    }
    // Maybe it's already the verdict
    if (wrapper.status) return wrapper;
  } catch {}

  // Try direct parse
  try {
    return JSON.parse(output);
  } catch {}

  // Try to find JSON in the output
  const match = output.match(/\{[\s\S]*"status"[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);

  throw new Error("No parseable verdict found");
}

function buildEvalContext(projectPath: string, specPath: string, testCase: HardenTestCase): string {
  const parts: string[] = [];

  // Include the spec.md
  const specFile = join(specPath, "spec.md");
  if (existsSync(specFile)) {
    const content = readFileSync(specFile, "utf-8");
    parts.push(`### spec.md (first 200 lines)\n\`\`\`\n${content.split("\n").slice(0, 200).join("\n")}\n\`\`\``);
  }

  // Include relevant source files based on test case keywords
  const keywords = extractKeywords(testCase);
  const srcDir = join(projectPath, "packages/specflow/src");

  if (existsSync(srcDir)) {
    const relevantFiles = findRelevantFiles(srcDir, keywords);
    for (const file of relevantFiles.slice(0, 5)) {
      // max 5 files
      const relPath = file.replace(projectPath + "/", "");
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      parts.push(
        `### ${relPath} (${lines.length} lines)\n\`\`\`typescript\n${lines.slice(0, 150).join("\n")}\n\`\`\``
      );
    }
  }

  // Include migration files if test mentions migration/schema/table
  const desc = testCase.description.toLowerCase() + " " + testCase.expectedResult.toLowerCase();
  if (desc.includes("migration") || desc.includes("table") || desc.includes("schema") || desc.includes("index")) {
    const migrationsDir = join(projectPath, "packages/specflow/migrations");
    if (existsSync(migrationsDir)) {
      for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
        const content = readFileSync(join(migrationsDir, f), "utf-8");
        parts.push(`### migrations/${f}\n\`\`\`sql\n${content}\n\`\`\``);
      }
    }
    // Also include embedded.ts
    const embeddedPath = join(srcDir, "lib/migrations/embedded.ts");
    if (existsSync(embeddedPath)) {
      const content = readFileSync(embeddedPath, "utf-8");
      parts.push(
        `### lib/migrations/embedded.ts (last 100 lines)\n\`\`\`typescript\n${content.split("\n").slice(-100).join("\n")}\n\`\`\``
      );
    }
  }

  return parts.join("\n\n") || "No relevant source files found.";
}

function extractKeywords(tc: HardenTestCase): string[] {
  const text = [tc.description, tc.expectedResult, ...tc.steps, ...tc.preconditions].join(" ").toLowerCase();
  const keywords: string[] = [];

  // Extract identifiers
  const identifiers = text.match(/[a-z_]+(?:_[a-z]+)+/g) || [];
  keywords.push(...identifiers);

  // Extract quoted terms
  const quoted = text.match(/`([^`]+)`/g) || [];
  keywords.push(...quoted.map((q) => q.replace(/`/g, "")));

  // Common mapping
  if (text.includes("spec_version") || text.includes("version")) keywords.push("spec-versions", "state");
  if (text.includes("delta")) keywords.push("diff", "spec-versions");
  if (text.includes("progress")) keywords.push("progress-writer", "progress-reader");
  if (text.includes("notification")) keywords.push("notifications", "dispatcher");
  if (text.includes("approval") || text.includes("gate")) keywords.push("gate-evaluator", "gate-resolver");
  if (text.includes("status")) keywords.push("status");
  if (text.includes("review")) keywords.push("review");
  if (text.includes("release")) keywords.push("release");
  if (text.includes("brownfield")) keywords.push("brownfield");
  if (text.includes("harden")) keywords.push("harden");
  if (text.includes("hook")) keywords.push("hook");

  return [...new Set(keywords)];
}

function findRelevantFiles(dir: string, keywords: string[], depth = 3): string[] {
  if (depth <= 0) return [];
  const results: string[] = [];

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findRelevantFiles(fullPath, keywords, depth - 1));
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        const nameLower = entry.name.toLowerCase().replace(".ts", "");
        if (keywords.some((k) => nameLower.includes(k) || k.includes(nameLower))) {
          results.push(fullPath);
        }
      }
    }
  } catch {}

  return results;
}
