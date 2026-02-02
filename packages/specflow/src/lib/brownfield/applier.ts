/**
 * Brownfield Apply
 * Takes a reviewed delta-spec and applies approved changes to create a new spec version.
 */

import { readFileSync, writeFileSync } from "fs";
import type { DeltaSpec, DeltaChange } from "./differ";

// =============================================================================
// Types
// =============================================================================

export interface ApplyOptions {
  /** Auto-approve all changes (headless mode) */
  autoApprove?: boolean;
  /** Change types to include (default: all) */
  includeTypes?: Array<"ADDED" | "MODIFIED" | "REMOVED">;
}

export interface ApplyResult {
  /** Whether the apply succeeded */
  success: boolean;
  /** Number of changes applied */
  changesApplied: number;
  /** The updated spec content */
  updatedSpec: string;
}

// =============================================================================
// Spec Updater
// =============================================================================

/**
 * Apply delta changes to a spec by appending a "Changes from Codebase" section
 */
export function applyDeltaToSpec(
  specContent: string,
  delta: DeltaSpec,
  approvedChanges: DeltaChange[]
): string {
  if (approvedChanges.length === 0) {
    return specContent;
  }

  const lines = [specContent.trimEnd()];
  lines.push("");
  lines.push("## Changes from Codebase Analysis");
  lines.push("");
  lines.push(`_Applied from delta-spec on ${new Date().toISOString()}_`);
  lines.push("");

  const added = approvedChanges.filter((c) => c.changeType === "ADDED");
  const modified = approvedChanges.filter((c) => c.changeType === "MODIFIED");
  const removed = approvedChanges.filter((c) => c.changeType === "REMOVED");

  if (added.length > 0) {
    lines.push("### Added Elements");
    lines.push("");
    for (const change of added) {
      lines.push(`- **${change.name}** (${change.category}): ${change.description}`);
    }
    lines.push("");
  }

  if (modified.length > 0) {
    lines.push("### Modified Elements");
    lines.push("");
    for (const change of modified) {
      lines.push(`- **${change.name}** (${change.category}): ${change.description}`);
    }
    lines.push("");
  }

  if (removed.length > 0) {
    lines.push("### Removed Elements");
    lines.push("");
    for (const change of removed) {
      lines.push(`- ~~${change.name}~~ (${change.category}): ${change.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Load and filter a delta-spec JSON
 */
export function loadAndFilterDelta(
  deltaPath: string,
  options: ApplyOptions
): { delta: DeltaSpec; approved: DeltaChange[] } {
  const delta: DeltaSpec = JSON.parse(readFileSync(deltaPath, "utf-8"));

  let approved = delta.changes;

  if (options.includeTypes) {
    approved = approved.filter((c) =>
      options.includeTypes!.includes(c.changeType)
    );
  }

  return { delta, approved };
}
