/**
 * Audit Command
 *
 * Detects spec-reality drift and outputs a health report with suggested fix commands.
 * Read-only -- no mutations.
 *
 * Output modes:
 *  - Default: human-readable grouped report with severity headers
 *  - --json: JSON.stringify(report)
 *  - --fix: print only suggestedFix lines (one per line, pipeable)
 *
 * Exit code 1 if any critical findings, 0 otherwise.
 */

import {
  initDatabase,
  closeDatabase,
  getDbPath,
  dbExists,
} from "../lib/database";
import { runAudit } from "../lib/audit/runner";
import type { AuditOptions, AuditCheckName, AuditFinding } from "../lib/audit/types";

export interface AuditCommandOptions {
  json?: boolean;
  fix?: boolean;
  check?: string;
  status?: string;
}

export function auditCommand(
  featureId: string | undefined,
  options: AuditCommandOptions
): void {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // Validate --check option if provided
    const validChecks: AuditCheckName[] = [
      "db-status",
      "spec-code",
      "json-sync",
      "phase-artifacts",
      "spec-freshness",
    ];
    if (options.check && !validChecks.includes(options.check as AuditCheckName)) {
      console.error(
        `Error: Invalid check name "${options.check}". Valid checks: ${validChecks.join(", ")}`
      );
      process.exit(1);
    }

    const auditOptions: AuditOptions & { featureId?: string } = {
      json: options.json,
      fix: options.fix,
      check: options.check as AuditCheckName | undefined,
      status: options.status,
      featureId,
    };

    const report = runAudit(projectPath, auditOptions);

    // Output mode: JSON
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.summary.critical > 0 ? 1 : 0);
    }

    // Output mode: --fix (suggested commands only, pipeable)
    if (options.fix) {
      for (const finding of report.findings) {
        if (finding.suggestedFix && finding.suggestedFix.trim() !== "") {
          console.log(finding.suggestedFix);
        }
      }
      process.exit(report.summary.critical > 0 ? 1 : 0);
    }

    // Output mode: human-readable report
    renderHumanReport(report.featureCount, report.findings, report.summary);
    process.exit(report.summary.critical > 0 ? 1 : 0);
  } finally {
    closeDatabase();
  }
}

function renderHumanReport(
  featureCount: number,
  findings: AuditFinding[],
  summary: { total: number; critical: number; warning: number; info: number }
): void {
  console.log(`\nAuditing ${featureCount} features...\n`);

  if (findings.length === 0) {
    console.log("No findings. Everything looks healthy.\n");
    return;
  }

  // Group by severity
  const critical = findings.filter((f) => f.severity === "critical");
  const warning = findings.filter((f) => f.severity === "warning");
  const info = findings.filter((f) => f.severity === "info");

  if (critical.length > 0) {
    console.log(`CRITICAL (${critical.length})`);
    for (const f of critical) {
      console.log(`  ${f.featureId.padEnd(7)} ${f.message}`);
      if (f.suggestedFix) {
        console.log(`         Fix: ${f.suggestedFix}`);
      }
      console.log("");
    }
  }

  if (warning.length > 0) {
    console.log(`WARNING (${warning.length})`);
    for (const f of warning) {
      console.log(`  ${f.featureId.padEnd(7)} ${f.message}`);
      if (f.suggestedFix) {
        console.log(`         Fix: ${f.suggestedFix}`);
      }
      console.log("");
    }
  }

  if (info.length > 0) {
    console.log(`INFO (${info.length})`);
    for (const f of info) {
      console.log(`  ${f.featureId.padEnd(7)} ${f.message}`);
      if (f.suggestedFix && f.suggestedFix.trim() !== "") {
        console.log(`         Fix: ${f.suggestedFix}`);
      }
      console.log("");
    }
  }

  const separator = "\u2500".repeat(50);
  console.log(separator);
  console.log(
    `${featureCount} features audited, ${summary.total} findings (${summary.critical} critical, ${summary.warning} warning, ${summary.info} info)\n`
  );
}
