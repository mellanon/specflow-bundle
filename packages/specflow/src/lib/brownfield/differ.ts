/**
 * Brownfield Delta-Spec Generator
 * Compares codebase scan against spec baseline and produces a delta-spec
 * with ADDED/MODIFIED/REMOVED elements, classified semantically by AI.
 */

import { join } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import type { ScanResult, FileEntry } from "./scanner";
import { runClaude } from "../claude";

// =============================================================================
// Types
// =============================================================================

export interface DeltaSpec {
  /** When the diff was generated */
  generatedAt: string;
  /** Feature ID this diff is for */
  featureId: string;
  /** Summary of changes */
  summary: {
    added: number;
    modified: number;
    removed: number;
  };
  /** Categorized changes */
  changes: DeltaChange[];
}

export interface DeltaChange {
  /** Type of change */
  changeType: "ADDED" | "MODIFIED" | "REMOVED";
  /** Category (e.g., "function", "type", "file", "dependency") */
  category: string;
  /** Name of the changed element */
  name: string;
  /** File path (if applicable) */
  filePath: string | null;
  /** Description of the change */
  description: string;
}

// =============================================================================
// Spec Baseline Extraction
// =============================================================================

interface SpecBaseline {
  files: Set<string>;
  exports: Set<string>;
  functions: Set<string>;
  types: Set<string>;
}

/**
 * Extract a baseline from a spec.md file by parsing mentioned files, functions, and types.
 */
function extractSpecBaseline(specContent: string): SpecBaseline {
  const files = new Set<string>();
  const exports = new Set<string>();
  const functions = new Set<string>();
  const types = new Set<string>();

  // Extract file paths (e.g., `src/lib/database.ts`)
  const filePaths = specContent.matchAll(/`([a-zA-Z0-9_/.-]+\.\w+)`/g);
  for (const match of filePaths) {
    if (match[1].includes("/") || match[1].includes(".ts") || match[1].includes(".js")) {
      files.add(match[1]);
    }
  }

  // Extract function/method names from backtick code
  const codeRefs = specContent.matchAll(/`(\w+)\(\)`|`(\w+)`/g);
  for (const match of codeRefs) {
    const name = match[1] || match[2];
    if (name && /^[a-z]/.test(name) && name.length > 2) {
      functions.add(name);
    }
  }

  // Extract type/interface/class names (PascalCase in backticks)
  const typeRefs = specContent.matchAll(/`([A-Z]\w+)`/g);
  for (const match of typeRefs) {
    types.add(match[1]);
  }

  return { files, exports, functions, types };
}

// =============================================================================
// Structural Diff (no AI)
// =============================================================================

/**
 * Compare scan results against a spec baseline structurally
 */
function computeStructuralDiff(
  scan: ScanResult,
  baseline: SpecBaseline
): DeltaChange[] {
  const changes: DeltaChange[] = [];

  // Build sets from scan
  const scanFiles = new Set(scan.files.map((f) => f.path));
  const scanExports = new Map<string, string>();
  const scanTypes = new Map<string, string>();

  for (const file of scan.files) {
    for (const exp of file.exports) {
      scanExports.set(exp.name, file.path);
    }
    for (const type of file.types) {
      scanTypes.set(type.name, file.path);
    }
  }

  // Files in scan but not in spec = ADDED
  for (const file of scan.files) {
    if (baseline.files.size > 0 && !baseline.files.has(file.path)) {
      changes.push({
        changeType: "ADDED",
        category: "file",
        name: file.path,
        filePath: file.path,
        description: `New file: ${file.exports.length} exports, ${file.lines} lines`,
      });
    }
  }

  // Files in spec but not in scan = REMOVED
  for (const specFile of baseline.files) {
    if (!scanFiles.has(specFile)) {
      changes.push({
        changeType: "REMOVED",
        category: "file",
        name: specFile,
        filePath: specFile,
        description: `File referenced in spec no longer exists`,
      });
    }
  }

  // Types in scan but not in spec = ADDED
  for (const [typeName, filePath] of scanTypes) {
    if (baseline.types.size > 0 && !baseline.types.has(typeName)) {
      changes.push({
        changeType: "ADDED",
        category: "type",
        name: typeName,
        filePath,
        description: `New type definition`,
      });
    }
  }

  // Types in spec but not in scan = REMOVED
  for (const specType of baseline.types) {
    if (!scanTypes.has(specType)) {
      changes.push({
        changeType: "REMOVED",
        category: "type",
        name: specType,
        filePath: null,
        description: `Type referenced in spec no longer exists in codebase`,
      });
    }
  }

  // Functions in scan but not in spec = ADDED
  for (const [exportName, filePath] of scanExports) {
    if (baseline.functions.size > 0 && !baseline.functions.has(exportName)) {
      changes.push({
        changeType: "ADDED",
        category: "function",
        name: exportName,
        filePath,
        description: `New exported function/symbol`,
      });
    }
  }

  return changes;
}

// =============================================================================
// AI Classification (via headless Claude)
// =============================================================================

/**
 * Use AI to classify and enrich structural diffs with semantic context.
 * Falls back to structural diff if AI is unavailable.
 */
async function classifyWithAI(
  changes: DeltaChange[],
  specContent: string,
  _projectPath: string
): Promise<DeltaChange[]> {
  if (changes.length === 0) return changes;

  // Build a prompt for AI classification
  const changesText = changes
    .map(
      (c) =>
        `[${c.changeType}] ${c.category}: ${c.name} (${c.filePath || "N/A"}) - ${c.description}`
    )
    .join("\n");

  const prompt = `You are analyzing changes between a specification and the current codebase.

Here are the structural changes detected:
${changesText}

For each change, provide a more detailed, semantic description that explains WHY this change matters in the context of the specification. Focus on:
- What capability was added/removed/changed
- Whether this represents a feature gap, drift, or intentional evolution
- Severity (breaking, notable, cosmetic)

Respond in JSON format as an array of objects with: name, description (enhanced)
Only return the JSON array, no other text.`;

  try {
    const result = await runClaudeHeadless(prompt);
    if (result) {
      const enhanced = JSON.parse(result) as Array<{
        name: string;
        description: string;
      }>;
      const enhancedMap = new Map(enhanced.map((e) => [e.name, e.description]));

      return changes.map((c) => ({
        ...c,
        description: enhancedMap.get(c.name) || c.description,
      }));
    }
  } catch {
    // Fall through to return unenhanced changes
  }

  return changes;
}

/**
 * Run Claude headless for AI classification
 * Uses shared runClaude utility with --system-prompt override and proper timeout
 */
async function runClaudeHeadless(prompt: string): Promise<string | null> {
  const result = await runClaude(prompt, {
    cwd: process.cwd(),
    timeout: 120_000,
    pipeOutput: false,
    systemPrompt: "You are a code analysis assistant. Respond only with the requested JSON format. No formatting, no headers, no explanations outside the JSON.",
  });

  return result.success ? result.output.trim() : null;
}

// =============================================================================
// Delta-Spec Markdown Generator
// =============================================================================

function generateDeltaSpecMarkdown(delta: DeltaSpec): string {
  const lines: string[] = [];

  lines.push(`# Delta-Spec: ${delta.featureId}`);
  lines.push(`\nGenerated: ${delta.generatedAt}`);
  lines.push(
    `\n## Summary\n\n| Change Type | Count |\n|-------------|-------|\n| Added | ${delta.summary.added} |\n| Modified | ${delta.summary.modified} |\n| Removed | ${delta.summary.removed} |`
  );

  const categories = new Map<string, DeltaChange[]>();
  for (const change of delta.changes) {
    const key = change.category;
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key)!.push(change);
  }

  for (const [category, categoryChanges] of categories) {
    lines.push(`\n## ${category.charAt(0).toUpperCase() + category.slice(1)} Changes\n`);

    for (const change of categoryChanges) {
      const icon =
        change.changeType === "ADDED"
          ? "+"
          : change.changeType === "REMOVED"
            ? "-"
            : "~";
      const fileRef = change.filePath ? ` (\`${change.filePath}\`)` : "";
      lines.push(`- \`${icon}\` **${change.name}**${fileRef}`);
      lines.push(`  ${change.description}`);
    }
  }

  lines.push(`\n## Proposed Spec Updates\n`);
  lines.push(
    `Review the changes above and approve/reject each category before running \`specflow brownfield apply\`.`
  );

  return lines.join("\n");
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a delta-spec by comparing codebase scan against spec baseline
 */
export async function generateDeltaSpec(
  featureId: string,
  scanPath: string,
  specPath: string,
  projectPath: string,
  useAI: boolean = true
): Promise<DeltaSpec> {
  // Load scan
  const scan: ScanResult = JSON.parse(readFileSync(scanPath, "utf-8"));

  // Load spec
  const specContent = readFileSync(specPath, "utf-8");

  // Extract baseline from spec
  const baseline = extractSpecBaseline(specContent);

  // Compute structural diff
  let changes = computeStructuralDiff(scan, baseline);

  // Enrich with AI classification
  if (useAI && changes.length > 0) {
    changes = await classifyWithAI(changes, specContent, projectPath);
  }

  const delta: DeltaSpec = {
    generatedAt: new Date().toISOString(),
    featureId,
    summary: {
      added: changes.filter((c) => c.changeType === "ADDED").length,
      modified: changes.filter((c) => c.changeType === "MODIFIED").length,
      removed: changes.filter((c) => c.changeType === "REMOVED").length,
    },
    changes,
  };

  return delta;
}

/**
 * Write delta-spec to file
 */
export function writeDeltaSpec(
  projectPath: string,
  delta: DeltaSpec
): { mdPath: string; jsonPath: string } {
  const brownfieldDir = join(projectPath, ".specify", "brownfield");
  mkdirSync(brownfieldDir, { recursive: true });

  const mdPath = join(brownfieldDir, "delta-spec.md");
  const jsonPath = join(brownfieldDir, "delta-spec.json");

  writeFileSync(mdPath, generateDeltaSpecMarkdown(delta));
  writeFileSync(jsonPath, JSON.stringify(delta, null, 2));

  return { mdPath, jsonPath };
}
