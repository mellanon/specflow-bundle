/**
 * Audit Module Types
 * Types for spec-reality drift detection and health reporting.
 */

export type AuditSeverity = "critical" | "warning" | "info";

export type AuditCheckName =
  | "db-status"
  | "spec-code"
  | "json-sync"
  | "phase-artifacts"
  | "spec-freshness";

export interface AuditFinding {
  severity: AuditSeverity;
  check: AuditCheckName;
  featureId: string;
  message: string;
  suggestedFix: string;
}

export interface AuditReport {
  auditedAt: string;
  featureCount: number;
  findings: AuditFinding[];
  summary: { total: number; critical: number; warning: number; info: number };
}

export interface AuditOptions {
  json?: boolean;
  fix?: boolean;
  check?: AuditCheckName;
  status?: string;
}
