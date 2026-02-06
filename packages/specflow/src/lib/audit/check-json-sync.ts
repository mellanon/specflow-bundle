/**
 * Audit Check: features.json vs DB Sync (FR-3)
 *
 * Compare feature IDs in features.json against database features table.
 * WARNING for mismatches in either direction.
 * Normalize IDs for comparison (F-001 vs F-1).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Feature } from "../../types";
import type { AuditFinding } from "./types";

interface JsonFeature {
  id: string;
  name?: string;
  description?: string;
}

/**
 * Normalize a feature ID to a canonical form: F-N (no leading zeros)
 */
export function normalizeFeatureId(id: string): string {
  const match = id.match(/^(F-)0*(\d+)$/i);
  if (match) {
    return `F-${match[2]}`;
  }
  return id.toUpperCase();
}

export function checkJsonSync(
  features: Feature[],
  projectPath: string
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Look for features.json in project root
  const jsonPath = join(projectPath, "features.json");
  if (!existsSync(jsonPath)) {
    // features.json is optional -- not having one is not a finding
    return findings;
  }

  let jsonFeatures: JsonFeature[];
  try {
    const raw = readFileSync(jsonPath, "utf-8");
    jsonFeatures = JSON.parse(raw) as JsonFeature[];
  } catch {
    findings.push({
      severity: "warning",
      check: "json-sync",
      featureId: "-",
      message: "features.json is malformed or unreadable",
      suggestedFix: "# Fix features.json syntax",
    });
    return findings;
  }

  // Build normalized ID sets
  const dbIds = new Map<string, Feature>();
  for (const f of features) {
    dbIds.set(normalizeFeatureId(f.id), f);
  }

  const jsonIds = new Map<string, JsonFeature>();
  for (const f of jsonFeatures) {
    jsonIds.set(normalizeFeatureId(f.id), f);
  }

  // Features in JSON but not in DB
  for (const [normalizedId, jsonFeature] of jsonIds) {
    if (!dbIds.has(normalizedId)) {
      const name = jsonFeature.name ?? "unknown";
      findings.push({
        severity: "warning",
        check: "json-sync",
        featureId: jsonFeature.id,
        message: `In features.json but not in database`,
        suggestedFix: `specflow add "${name}" "${jsonFeature.description ?? ""}"`,
      });
    }
  }

  // Features in DB but not in JSON
  for (const [normalizedId, dbFeature] of dbIds) {
    if (!jsonIds.has(normalizedId)) {
      // Skip features that are skipped in DB -- they may have been intentionally removed from JSON
      if (dbFeature.status === "skipped") continue;

      findings.push({
        severity: "warning",
        check: "json-sync",
        featureId: dbFeature.id,
        message: `In database but not in features.json`,
        suggestedFix: `# Add ${dbFeature.id} to features.json or remove from DB`,
      });
    }
  }

  return findings;
}
