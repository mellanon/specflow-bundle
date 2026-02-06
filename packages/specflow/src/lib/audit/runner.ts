/**
 * Audit Runner
 *
 * Orchestrates all audit checks and produces an AuditReport.
 * Loads features, applies filters, runs checkers, sorts findings.
 */

import { getFeatures, getFeature } from "../database";
import type { Feature } from "../../types";
import type { AuditCheckName, AuditFinding, AuditOptions, AuditReport } from "./types";
import { checkDbStatus } from "./check-db-status";
import { checkSpecCode } from "./check-spec-code";
import { checkJsonSync } from "./check-json-sync";
import { checkPhaseArtifacts } from "./check-phase-artifacts";
import { checkSpecFreshness } from "./check-spec-freshness";

/**
 * Severity sort order: critical > warning > info
 */
const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Run audit checks and produce a report.
 */
export function runAudit(
  projectPath: string,
  options: AuditOptions & { featureId?: string }
): AuditReport {
  // Load features
  let features: Feature[];

  if (options.featureId) {
    const feature = getFeature(options.featureId);
    if (!feature) {
      return {
        auditedAt: new Date().toISOString(),
        featureCount: 0,
        findings: [{
          severity: "critical",
          check: "db-status",
          featureId: options.featureId,
          message: `Feature ${options.featureId} not found in database`,
          suggestedFix: `specflow add "${options.featureId}" "description"`,
        }],
        summary: { total: 1, critical: 1, warning: 0, info: 0 },
      };
    }
    features = [feature];
  } else {
    features = getFeatures();
  }

  // Apply status filter
  if (options.status) {
    features = features.filter((f) => f.status === options.status);
  }

  // Run checks
  let allFindings: AuditFinding[] = [];

  const checks: Array<{
    name: AuditCheckName;
    run: () => AuditFinding[];
  }> = [
    { name: "db-status", run: () => checkDbStatus(features) },
    { name: "spec-code", run: () => checkSpecCode(features, projectPath) },
    { name: "json-sync", run: () => checkJsonSync(features, projectPath) },
    { name: "phase-artifacts", run: () => checkPhaseArtifacts(features, projectPath) },
    { name: "spec-freshness", run: () => checkSpecFreshness(features) },
  ];

  for (const check of checks) {
    // If --check is specified, only run that single check
    if (options.check && options.check !== check.name) continue;
    allFindings.push(...check.run());
  }

  // Sort: critical > warning > info, then by feature ID
  allFindings.sort((a, b) => {
    const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (severityDiff !== 0) return severityDiff;
    return a.featureId.localeCompare(b.featureId, undefined, { numeric: true });
  });

  // Build summary
  const summary = {
    total: allFindings.length,
    critical: allFindings.filter((f) => f.severity === "critical").length,
    warning: allFindings.filter((f) => f.severity === "warning").length,
    info: allFindings.filter((f) => f.severity === "info").length,
  };

  return {
    auditedAt: new Date().toISOString(),
    featureCount: features.length,
    findings: allFindings,
    summary,
  };
}
