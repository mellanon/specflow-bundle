/**
 * Audit Check: DB Status vs Reality (FR-1)
 *
 * For features with status=complete, verify spec directory exists.
 * For features with status=skipped, note as INFO with skip reason.
 * CRITICAL if spec directory missing for a complete feature.
 */

import { existsSync } from "fs";
import type { Feature } from "../../types";
import type { AuditFinding } from "./types";

export function checkDbStatus(features: Feature[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const feature of features) {
    if (feature.status === "complete" || feature.status === "evolving") {
      // Complete features should have a spec directory
      if (!feature.specPath || !existsSync(feature.specPath)) {
        findings.push({
          severity: "critical",
          check: "db-status",
          featureId: feature.id,
          message: `Status=${feature.status} but spec directory ${feature.specPath ? `"${feature.specPath}"` : ""} not found`,
          suggestedFix: `specflow skip ${feature.id} --reason superseded --justification "spec directory missing"`,
        });
      }
    }

    if (feature.status === "skipped") {
      const reason = feature.skipReason ?? "no reason given";
      findings.push({
        severity: "info",
        check: "db-status",
        featureId: feature.id,
        message: `Status=skipped (reason: ${reason})`,
        suggestedFix: "",
      });
    }
  }

  return findings;
}
