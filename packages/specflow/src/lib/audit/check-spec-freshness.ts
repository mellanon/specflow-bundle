/**
 * Audit Check: Spec Freshness (FR-5)
 *
 * Compute hash of current spec.md content.
 * Compare against stored hash from spec_versions table via getLatestSpecVersion.
 * WARNING if hashes don't match (spec modified without versioning).
 * INFO if no version history exists.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import type { Feature } from "../../types";
import type { AuditFinding } from "./types";
import { getLatestSpecVersion } from "../spec-versions/state";

/**
 * Compute SHA-256 hash of file content.
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function checkSpecFreshness(features: Feature[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const feature of features) {
    if (!feature.specPath) continue;
    if (feature.status === "skipped") continue;

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) continue;

    let specContent: string;
    try {
      specContent = readFileSync(specFile, "utf-8");
    } catch {
      continue;
    }

    const currentHash = computeHash(specContent);

    // Get the latest versioned hash from the database
    let latestVersion;
    try {
      latestVersion = getLatestSpecVersion(feature.id);
    } catch {
      // Database may not have the spec_versions table yet or feature may not have versions
      latestVersion = null;
    }

    if (!latestVersion) {
      findings.push({
        severity: "info",
        check: "spec-freshness",
        featureId: feature.id,
        message: "No spec version history exists",
        suggestedFix: `specflow revise ${feature.id} --spec`,
      });
      continue;
    }

    if (currentHash !== latestVersion.contentHash) {
      findings.push({
        severity: "warning",
        check: "spec-freshness",
        featureId: feature.id,
        message: `spec.md modified since last versioned hash (v${latestVersion.version})`,
        suggestedFix: `specflow revise ${feature.id} --spec`,
      });
    }
  }

  return findings;
}
