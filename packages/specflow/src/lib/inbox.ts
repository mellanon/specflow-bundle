/**
 * Inbox Module (F-025)
 * Priority-ranked review queue for features awaiting human approval.
 */

import type { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync } from "fs";
import type { InboxItem, InboxResult, PendingApproval, ReviewResult } from "../types";
import { listPending } from "./gate-resolver";
import { readReviewJson } from "./review/artifacts";
import { getFeature } from "./database";

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Convert an ISO date string to a human-readable relative time.
 * Examples: "3m ago", "2h ago", "5d ago"
 */
export function formatTimeAgo(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// =============================================================================
// Priority Classification
// =============================================================================

/**
 * Classify the priority of a review item.
 *
 * P0: Review failed or no review data available (needs immediate attention)
 * P1: Review passed and triggered less than 24 hours ago
 * P2: Review passed and triggered 24+ hours ago (stale)
 */
export function classifyPriority(
  review: ReviewResult | null,
  triggeredAt: string,
): "P0" | "P1" | "P2" {
  // No review data or review failed => P0
  if (!review || !review.passed) {
    return "P0";
  }

  // Passed - check age
  const ageMs = Date.now() - new Date(triggeredAt).getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  if (ageMs < twentyFourHours) {
    return "P1";
  }

  return "P2";
}

// =============================================================================
// Verdict Builder
// =============================================================================

/**
 * Build verdict string, detail array, and decision guidance from a review result.
 */
export function buildVerdict(review: ReviewResult | null): {
  verdict: "ALL PASS" | string;
  verdictDetail: string[];
  decision: string;
} {
  if (!review) {
    return {
      verdict: "NO REVIEW",
      verdictDetail: ["No review.json found"],
      decision: "Run 'specflow review' before approving",
    };
  }

  const detail: string[] = [];

  // Automated checks
  const ac = review.automatedChecks;
  if (ac.passed) {
    detail.push("Automated checks: pass");
  } else {
    detail.push("Automated checks: FAIL");
    if (ac.alignment.missing > 0) {
      detail.push(`  ${ac.alignment.missing} file(s) missing`);
    }
  }

  // Acceptance tests
  const at = review.acceptanceTests;
  if (at && at.available) {
    if (at.fail > 0) {
      detail.push(`Acceptance tests: ${at.pass}/${at.total} pass, ${at.fail} FAIL`);
    } else if (at.pending > 0) {
      detail.push(`Acceptance tests: ${at.pass}/${at.total} pass, ${at.pending} pending`);
    } else {
      detail.push(`Acceptance tests: ${at.pass}/${at.total} pass`);
    }
  }

  if (review.passed) {
    return {
      verdict: "ALL PASS",
      verdictDetail: detail,
      decision: "Safe to approve",
    };
  }

  // Build a concise failure verdict
  const failParts: string[] = [];
  if (!ac.passed) failParts.push("checks fail");
  if (at && at.available && at.fail > 0) failParts.push(`${at.fail} AT fail`);
  if (at && at.available && at.pending > 0) failParts.push(`${at.pending} AT pending`);

  return {
    verdict: failParts.length > 0 ? `NEEDS ATTENTION: ${failParts.join(", ")}` : "NEEDS ATTENTION",
    verdictDetail: detail,
    decision: "Review failures before approving",
  };
}

// =============================================================================
// Inbox Builder (Orchestrator)
// =============================================================================

/**
 * Build the inbox by querying pending approval gates, enriching with review data
 * and feature metadata, and sorting by priority.
 */
export function buildInbox(db: Database, projectPath: string): InboxResult {
  const pending: PendingApproval[] = listPending(db);

  const items: InboxItem[] = [];

  for (const gate of pending) {
    const feature = getFeature(gate.feature_id);
    const review = readReviewJson(projectPath, gate.feature_id);
    const { verdict, verdictDetail, decision } = buildVerdict(review);
    const priority = classifyPriority(review, gate.triggered_at);

    // Check for acceptance test file
    const atPath = join(
      projectPath,
      ".specify",
      "harden",
      gate.feature_id.toLowerCase(),
      "acceptance-test.md",
    );
    const acceptanceTestPath = existsSync(atPath) ? atPath : null;

    // Review path
    const reviewPath = join(
      projectPath,
      ".specify",
      "review",
      gate.feature_id.toLowerCase(),
      "review.json",
    );

    items.push({
      featureId: gate.feature_id,
      name: feature?.name ?? gate.feature_id,
      priority,
      verdict,
      verdictDetail,
      timeInQueue: formatTimeAgo(gate.triggered_at),
      timeInQueueMs: Date.now() - new Date(gate.triggered_at).getTime(),
      reviewPath,
      acceptanceTestPath,
      decision,
    });
  }

  // Sort: P0 first, then P1, then P2. Within same priority, oldest first (highest timeInQueueMs).
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  items.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.timeInQueueMs - a.timeInQueueMs; // oldest first
  });

  // Summary counts
  const summary = {
    total: items.length,
    p0: items.filter((i) => i.priority === "P0").length,
    p1: items.filter((i) => i.priority === "P1").length,
    p2: items.filter((i) => i.priority === "P2").length,
  };

  // Suggest batch approve for all-pass items (P1 + P2 only, not P0)
  const batchCandidates = items.filter(
    (i) => i.verdict === "ALL PASS" && i.priority !== "P0",
  );
  const suggestedBatchApprove =
    batchCandidates.length >= 2
      ? `specflow approve ${batchCandidates.map((i) => i.featureId).join(" ")}`
      : null;

  return { queue: items, summary, suggestedBatchApprove };
}

// =============================================================================
// Renderers
// =============================================================================

/**
 * Render the compact table view (default).
 */
export function renderCompactInbox(result: InboxResult): string {
  if (result.queue.length === 0) {
    return "Inbox empty -- no features awaiting review";
  }

  const lines: string[] = [];

  lines.push(`Review Inbox (${result.summary.total} items)`);
  lines.push("");

  // Header
  const priW = 4;
  const featW = 9;
  const nameW = 22;
  const verdictW = 22;
  const ageW = 10;

  lines.push(
    `${"PRI".padEnd(priW)}${"FEATURE".padEnd(featW)}${"NAME".padEnd(nameW)}${"VERDICT".padEnd(verdictW)}${"AGE".padEnd(ageW)}`,
  );

  for (const item of result.queue) {
    const name = item.name.length > 20 ? item.name.substring(0, 20) + ".." : item.name;
    const verdictStr =
      item.verdict.length > 20 ? item.verdict.substring(0, 20) + ".." : item.verdict;

    lines.push(
      `${item.priority.padEnd(priW)}${item.featureId.padEnd(featW)}${name.padEnd(nameW)}${verdictStr.padEnd(verdictW)}${item.timeInQueue.padEnd(ageW)}`,
    );
  }

  // Quick actions
  const p0Items = result.queue.filter((i) => i.priority === "P0");
  if (p0Items.length > 0 || result.suggestedBatchApprove) {
    lines.push("");
    lines.push("Quick actions:");
    if (p0Items.length > 0) {
      lines.push(
        `  Review P0 items:    specflow review ${p0Items[0].featureId}`,
      );
    }
    if (result.suggestedBatchApprove) {
      lines.push(`  Batch approve:      ${result.suggestedBatchApprove}`);
    }
  }

  return lines.join("\n");
}

/**
 * Render the verbose expanded view.
 */
export function renderVerboseInbox(result: InboxResult): string {
  if (result.queue.length === 0) {
    return "Inbox empty -- no features awaiting review";
  }

  const lines: string[] = [];

  lines.push(`Review Inbox (${result.summary.total} items)`);
  lines.push(
    `  P0: ${result.summary.p0}  P1: ${result.summary.p1}  P2: ${result.summary.p2}`,
  );
  lines.push("");

  for (const item of result.queue) {
    lines.push(`--- ${item.priority} ${item.featureId}: ${item.name} (${item.timeInQueue})`);
    lines.push("");

    lines.push(`  Verdict: ${item.verdict}`);
    for (const detail of item.verdictDetail) {
      lines.push(`    ${detail}`);
    }
    lines.push("");

    lines.push(`  Decision: ${item.decision}`);
    lines.push(`  Review:   ${item.reviewPath}`);
    if (item.acceptanceTestPath) {
      lines.push(`  AT File:  ${item.acceptanceTestPath}`);
    }
    lines.push("");
  }

  if (result.suggestedBatchApprove) {
    lines.push(`Batch approve: ${result.suggestedBatchApprove}`);
  }

  return lines.join("\n");
}

/**
 * Render JSON output.
 */
export function renderJsonInbox(result: InboxResult): string {
  return JSON.stringify(result, null, 2);
}
