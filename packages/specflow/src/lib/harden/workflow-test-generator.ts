/**
 * Workflow Test Generator
 *
 * Uses AI to generate 3-5 high-level acceptance tests from a feature's
 * purpose and spec, rather than 1:1 mapping from FRs/Scenarios.
 *
 * Uses the claude -p inference pattern with --output-format json
 * for reliable JSON extraction in PAI environments.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface WorkflowTest {
  id: string;           // AT-1, AT-2, etc.
  title: string;        // "Verify harden generates protocol and runs session"
  covers: string[];     // ["Scenarios 1-2", "FR-1", "FR-2", "FR-3"]
  setup: string[];      // Preconditions
  steps: string[];      // What to do
  verify: string[];     // What to check
}

export interface WorkflowTestResult {
  tests: WorkflowTest[];
  featureId: string;
  featureName: string;
  specHash: string;
}

/**
 * Generate workflow-level acceptance tests for a feature
 */
export async function generateWorkflowTests(
  featureId: string,
  featureName: string,
  featureDescription: string,
  specPath: string
): Promise<WorkflowTestResult> {
  // Read spec.md
  const specFile = join(specPath, "spec.md");
  if (!existsSync(specFile)) {
    throw new Error(`spec.md not found at ${specFile}`);
  }
  const specContent = readFileSync(specFile, "utf-8");

  // Extract key sections for context (not for 1:1 test generation)
  const overview = extractSection(specContent, "Overview") || featureDescription;
  const scenarios = extractSection(specContent, "User Scenarios") || "";
  const requirements = extractSection(specContent, "Functional Requirements") || "";

  // Build prompts
  const systemPrompt = `You generate acceptance tests as JSON. Return ONLY a valid JSON array, no markdown, no explanation. Each test object has: id, title, covers, setup, steps, verify (all arrays except id and title which are strings).`;

  const userPrompt = buildWorkflowPrompt(featureId, featureName, overview, scenarios, requirements);

  // Call Claude with --output-format json for reliable extraction
  const proc = Bun.spawn(
    ["claude", "-p", "--output-format", "json", "--system-prompt", systemPrompt, userPrompt],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env } }
  );

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Claude failed with exit code ${exitCode}: ${stderr}`);
  }

  // Parse response - extract from JSON envelope if present
  const tests = extractAndParseWorkflowTests(output);

  // Compute spec hash
  const specHash = computeHash(specContent);

  return {
    tests,
    featureId,
    featureName,
    specHash,
  };
}

function buildWorkflowPrompt(
  featureId: string,
  featureName: string,
  overview: string,
  scenarios: string,
  requirements: string
): string {
  return `Generate 3-5 acceptance tests for this feature. Return a JSON array only.

Feature: ${featureId} - ${featureName}

Overview:
${overview}

User Scenarios:
${scenarios}

Functional Requirements:
${requirements}

Requirements for tests:
1. Test complete user workflows, not individual checkboxes
2. Each test should take a human 2-5 minutes to execute
3. Together they should cover all important functionality
4. Use AT-1, AT-2, etc. as IDs
5. Each verify item must be BINARY TESTABLE (YES/NO determinable in ~2 seconds)
6. Verify items should describe observable outcomes, not actions

Good verify: "Protocol file exists at .specify/harden/{id}/protocol.md"
Bad verify: "Check that the file was created correctly"

Return JSON array: [{"id":"AT-1","title":"...","covers":["FR-1","Scenario 1"],"setup":["..."],"steps":["..."],"verify":["..."]}]`;
}

/**
 * Extract JSON from Claude response, handling:
 * 1. --output-format json envelope: {"type":"result","result":"..."}
 * 2. Markdown code blocks: ```json ... ```
 * 3. Raw JSON arrays: [...]
 */
function extractAndParseWorkflowTests(output: string): WorkflowTest[] {
  let jsonStr: string;

  // Try to extract from --output-format json envelope first
  try {
    const envelope = JSON.parse(output);
    if (envelope.type === "result" && typeof envelope.result === "string") {
      // The result field contains the actual response, possibly with JSON inside
      jsonStr = envelope.result;
    } else {
      jsonStr = output;
    }
  } catch {
    // Not a JSON envelope, use as-is
    jsonStr = output;
  }

  // Now extract JSON array from the content
  // Try markdown code fence
  const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeFenceMatch) {
    jsonStr = codeFenceMatch[1].trim();
  } else {
    // Try to find raw JSON array
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }
  }

  // Parse the JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}\nRaw output: ${output.slice(0, 500)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array of workflow tests, got: ${typeof parsed}`);
  }

  return parsed.map((item, index) => ({
    id: item.id || `AT-${index + 1}`,
    title: item.title || `Workflow Test ${index + 1}`,
    covers: Array.isArray(item.covers) ? item.covers : [],
    setup: Array.isArray(item.setup) ? item.setup : [],
    steps: Array.isArray(item.steps) ? item.steps : [],
    verify: Array.isArray(item.verify) ? item.verify : [],
  }));
}

function extractSection(content: string, sectionName: string): string | null {
  // Match ## Section Name through to next ## or end
  const regex = new RegExp(`## ${sectionName}\\s*([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function computeHash(content: string): string {
  // Simple hash for spec versioning
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
