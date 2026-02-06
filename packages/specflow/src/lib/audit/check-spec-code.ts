/**
 * Audit Check: Spec vs Codebase Alignment (FR-2)
 *
 * Read spec.md for each feature, extract `## Implementation Files` section.
 * Parse file paths from lines containing backticked paths or paths ending in .ts/.js.
 * Verify each path exists with existsSync.
 * WARNING for files listed in spec but not found.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Feature } from "../../types";
import type { AuditFinding } from "./types";

/**
 * Extract file paths from the ## Implementation Files section of a spec.
 * Handles:
 *  - Table rows: | `src/lib/foo.ts` | description |
 *  - Backtick paths: `src/lib/foo.ts`
 *  - Bare paths: src/lib/foo.ts
 *  - Markdown list items: - `src/lib/foo.ts` -- description
 */
export function extractImplementationFiles(specContent: string): string[] {
  const files: string[] = [];

  // Find the ## Implementation Files section
  // Split on ## headings and find the right section
  const lines = specContent.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    if (/^## Implementation Files\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) {
      break; // Next section starts
    }
    if (inSection) {
      sectionLines.push(line);
    }
  }

  if (sectionLines.length === 0) return files;

  for (const line of sectionLines) {
    // Skip header separator rows (|---|---|)
    if (/^\s*\|[-\s|]+\|\s*$/.test(line)) continue;
    // Skip empty lines
    if (line.trim() === "") continue;

    // Extract backticked paths
    const backtickMatches = line.matchAll(/`([^`]+\.[a-z]{1,4})`/g);
    for (const match of backtickMatches) {
      const path = match[1].trim();
      // Filter to likely file paths (contain a dot and slash, or end with common extensions)
      if (/\.(ts|js|tsx|jsx|json|md|yaml|yml)$/.test(path)) {
        files.push(path);
      }
    }

    // If no backtick path found, try bare path patterns
    if (!line.includes("`")) {
      const bareMatch = line.match(
        /(?:^[-*]\s+|\|\s*)?((?:src|lib|test|tests|packages)\/[^\s|,]+\.[a-z]{1,4})/
      );
      if (bareMatch) {
        files.push(bareMatch[1].trim());
      }
    }
  }

  return [...new Set(files)]; // Deduplicate
}

export function checkSpecCode(
  features: Feature[],
  projectPath: string
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const feature of features) {
    if (!feature.specPath) continue;

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) continue;

    let specContent: string;
    try {
      specContent = readFileSync(specFile, "utf-8");
    } catch {
      continue;
    }

    const implFiles = extractImplementationFiles(specContent);

    for (const filePath of implFiles) {
      const fullPath = join(projectPath, filePath);
      if (!existsSync(fullPath)) {
        findings.push({
          severity: "warning",
          check: "spec-code",
          featureId: feature.id,
          message: `Spec lists ${filePath} but file not found`,
          suggestedFix: `# Create the missing file or update spec: specflow revise ${feature.id} --spec`,
        });
      }
    }
  }

  return findings;
}
