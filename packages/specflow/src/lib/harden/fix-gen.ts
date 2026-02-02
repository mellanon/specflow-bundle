/**
 * Harden Fix Generator — F-023
 * Generates fix descriptors for bug-classified failures (does NOT apply fixes)
 */

import { spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { readTriage, writeFixes } from "./artifacts";
import type { FixDescriptors, FixDescriptor } from "../../types";

/**
 * Generate fix descriptors for bug-classified triage entries
 */
export function generateFixDescriptors(
  projectPath: string,
  featureId: string
): FixDescriptors {
  const triage = readTriage(projectPath, featureId);

  const bugs = triage.decisions.filter((d) => d.category === "bug");

  if (bugs.length === 0) {
    const result: FixDescriptors = {
      featureId,
      generatedAt: new Date().toISOString(),
      descriptors: [],
    };
    writeFixes(projectPath, featureId, result);
    console.log("  0 fix descriptors generated (no bugs)");
    return result;
  }

  const descriptors: FixDescriptor[] = [];

  for (const bug of bugs) {
    // Try to extract file path from suggestedFix
    const fileHint = bug.suggestedFix || "";
    const fileMatch = fileHint.match(/(?:^|\s)([\w/.:-]+\.(?:ts|js|json|sql|md))/);
    const filePath = fileMatch?.[1] || "";

    // Read source context if we can find the file
    let codeContext: string | null = null;
    if (filePath) {
      const fullPath = filePath.startsWith("/") ? filePath : `${projectPath}/${filePath}`;
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          codeContext = lines.slice(0, 80).join("\n");
        } catch {}
      }
    }

    const prompt = `You are a senior engineer. Generate a fix descriptor for this bug.

## Bug: ${bug.testCaseId}
- **Reasoning:** ${bug.reasoning}
- **Suggested Fix:** ${bug.suggestedFix || "none"}
${codeContext ? `\n## Source Context (${filePath}):\n\`\`\`\n${codeContext}\n\`\`\`` : ""}

Respond with EXACTLY this JSON (no markdown, no code blocks):
{"filePath": "path/to/file.ts", "description": "what is wrong", "suggestedChange": "detailed description of the fix"}`;

    const result = spawnSync("claude", ["-p", prompt, "--output-format", "json"], {
      cwd: projectPath,
      timeout: 60000,
      encoding: "utf-8",
      env: { ...process.env },
    });

    let descriptor: FixDescriptor = {
      testCaseId: bug.testCaseId,
      filePath: filePath || "unknown",
      description: bug.reasoning,
      suggestedChange: bug.suggestedFix || "No suggestion available",
      codeContext,
    };

    if (!result.error && result.status === 0) {
      try {
        const parsed = parseFixResponse(result.stdout.trim());
        descriptor = {
          testCaseId: bug.testCaseId,
          filePath: parsed.filePath || filePath || "unknown",
          description: parsed.description || bug.reasoning,
          suggestedChange: parsed.suggestedChange || "No suggestion available",
          codeContext,
        };
      } catch {
        // Keep default descriptor
      }
    }

    descriptors.push(descriptor);
  }

  const fixResult: FixDescriptors = {
    featureId,
    generatedAt: new Date().toISOString(),
    descriptors,
  };

  writeFixes(projectPath, featureId, fixResult);

  console.log(`  ${descriptors.length} fix descriptors generated`);

  return fixResult;
}

function parseFixResponse(output: string): any {
  try {
    const wrapper = JSON.parse(output);
    if (wrapper.result) {
      const text = wrapper.result;
      const jsonMatch = text.match(/\{[\s\S]*"filePath"[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return JSON.parse(text);
    }
    if (wrapper.filePath) return wrapper;
  } catch {}

  try {
    return JSON.parse(output);
  } catch {}

  const match = output.match(/\{[\s\S]*"filePath"[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);

  throw new Error("No parseable fix response found");
}
