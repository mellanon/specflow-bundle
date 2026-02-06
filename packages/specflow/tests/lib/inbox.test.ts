/**
 * Tests for inbox module (F-025)
 * Covers: formatTimeAgo, classifyPriority, buildVerdict, buildInbox, renderers
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  addFeature,
  getDbInstance,
  SPECFLOW_DIR,
  DB_FILENAME,
} from "../../src/lib/database";
import { writeReviewJson } from "../../src/lib/review/artifacts";
import type { ReviewResult } from "../../src/types";
import {
  formatTimeAgo,
  classifyPriority,
  buildVerdict,
  buildInbox,
  renderCompactInbox,
  renderVerboseInbox,
  renderJsonInbox,
} from "../../src/lib/inbox";

const TEST_PROJECT_DIR = "/tmp/specflow-inbox-test";
const TEST_SPECFLOW_DIR = join(TEST_PROJECT_DIR, SPECFLOW_DIR);
const TEST_DB_PATH = join(TEST_SPECFLOW_DIR, DB_FILENAME);

// =============================================================================
// Helpers
// =============================================================================

function makeReview(featureId: string, passed: boolean, opts?: Partial<ReviewResult>): ReviewResult {
  return {
    featureId,
    featureName: `feature-${featureId}`,
    reviewedAt: new Date().toISOString(),
    passed,
    automatedChecks: {
      passed,
      checks: [{ name: "typecheck", passed, duration: 100 }],
      alignment: { matched: 5, missing: passed ? 0 : 2 },
    },
    acceptanceTests: opts?.acceptanceTests ?? {
      available: true,
      total: 3,
      pass: passed ? 3 : 1,
      fail: passed ? 0 : 2,
      skip: 0,
      pending: 0,
    },
    summary: {
      checksPass: passed,
      acceptanceTestsPass: passed,
    },
    ...opts,
  };
}

function insertPendingGate(featureId: string, triggeredAt?: string): void {
  const db = getDbInstance();
  const now = triggeredAt ?? new Date().toISOString();
  db.run(
    `INSERT INTO approval_gates (feature_id, phase_boundary, urgency, status, triggered_at)
     VALUES (?, 'implement_to_complete', 'review', 'pending', ?)`,
    [featureId, now],
  );
}

// =============================================================================
// formatTimeAgo
// =============================================================================

describe("formatTimeAgo", () => {
  it("should return 'just now' for very recent timestamps", () => {
    const now = new Date().toISOString();
    expect(formatTimeAgo(now)).toBe("just now");
  });

  it("should return minutes for timestamps under 1 hour", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    expect(formatTimeAgo(thirtyMinAgo)).toBe("30m ago");
  });

  it("should return hours for timestamps under 24 hours", () => {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60_000).toISOString();
    expect(formatTimeAgo(fourHoursAgo)).toBe("4h ago");
  });

  it("should return days for timestamps over 24 hours", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatTimeAgo(threeDaysAgo)).toBe("3d ago");
  });

  it("should return 'just now' for future timestamps", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(formatTimeAgo(future)).toBe("just now");
  });
});

// =============================================================================
// classifyPriority
// =============================================================================

describe("classifyPriority", () => {
  it("should return P0 when review is null", () => {
    expect(classifyPriority(null, new Date().toISOString())).toBe("P0");
  });

  it("should return P0 when review failed", () => {
    const review = makeReview("F-1", false);
    expect(classifyPriority(review, new Date().toISOString())).toBe("P0");
  });

  it("should return P1 when review passed and triggered recently", () => {
    const review = makeReview("F-1", true);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    expect(classifyPriority(review, twoHoursAgo)).toBe("P1");
  });

  it("should return P2 when review passed and triggered 24h+ ago", () => {
    const review = makeReview("F-1", true);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(classifyPriority(review, twoDaysAgo)).toBe("P2");
  });
});

// =============================================================================
// buildVerdict
// =============================================================================

describe("buildVerdict", () => {
  it("should return NO REVIEW when review is null", () => {
    const result = buildVerdict(null);
    expect(result.verdict).toBe("NO REVIEW");
    expect(result.verdictDetail).toContain("No review.json found");
  });

  it("should return ALL PASS for passing review", () => {
    const review = makeReview("F-1", true);
    const result = buildVerdict(review);
    expect(result.verdict).toBe("ALL PASS");
    expect(result.decision).toBe("Safe to approve");
  });

  it("should return NEEDS ATTENTION for failed review", () => {
    const review = makeReview("F-1", false);
    const result = buildVerdict(review);
    expect(result.verdict).toContain("NEEDS ATTENTION");
    expect(result.decision).toBe("Review failures before approving");
  });

  it("should include AT failure count in verdict detail", () => {
    const review = makeReview("F-1", false, {
      acceptanceTests: {
        available: true,
        total: 5,
        pass: 3,
        fail: 2,
        skip: 0,
        pending: 0,
      },
    });
    const result = buildVerdict(review);
    expect(result.verdictDetail.some((d) => d.includes("2 FAIL"))).toBe(true);
  });
});

// =============================================================================
// buildInbox (integration)
// =============================================================================

describe("buildInbox", () => {
  beforeEach(() => {
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
    mkdirSync(TEST_SPECFLOW_DIR, { recursive: true });
    initDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    closeDatabase();
    if (existsSync(TEST_PROJECT_DIR)) {
      rmSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  it("should return empty queue when no pending gates", () => {
    const db = getDbInstance();
    const result = buildInbox(db, TEST_PROJECT_DIR);

    expect(result.queue).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.suggestedBatchApprove).toBeNull();
  });

  it("should build items from pending gates", () => {
    addFeature({ id: "F-1", name: "Auth", description: "Auth feature", priority: 1 });
    insertPendingGate("F-1");

    const db = getDbInstance();
    const result = buildInbox(db, TEST_PROJECT_DIR);

    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].featureId).toBe("F-1");
    expect(result.queue[0].name).toBe("Auth");
    expect(result.queue[0].priority).toBe("P0"); // no review data
  });

  it("should classify items with review data correctly", () => {
    addFeature({ id: "F-1", name: "Auth", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "CRUD", description: "Desc", priority: 2 });

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    insertPendingGate("F-1", twoHoursAgo);
    insertPendingGate("F-2", twoHoursAgo);

    // F-1 passes review, F-2 fails
    writeReviewJson(TEST_PROJECT_DIR, "F-1", makeReview("F-1", true));
    writeReviewJson(TEST_PROJECT_DIR, "F-2", makeReview("F-2", false));

    const db = getDbInstance();
    const result = buildInbox(db, TEST_PROJECT_DIR);

    expect(result.queue).toHaveLength(2);

    // P0 (failed) should come before P1 (passed recent)
    expect(result.queue[0].featureId).toBe("F-2");
    expect(result.queue[0].priority).toBe("P0");
    expect(result.queue[1].featureId).toBe("F-1");
    expect(result.queue[1].priority).toBe("P1");
  });

  it("should suggest batch approve when 2+ items pass", () => {
    addFeature({ id: "F-1", name: "Auth", description: "Desc", priority: 1 });
    addFeature({ id: "F-2", name: "CRUD", description: "Desc", priority: 2 });

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    insertPendingGate("F-1", twoHoursAgo);
    insertPendingGate("F-2", twoHoursAgo);

    writeReviewJson(TEST_PROJECT_DIR, "F-1", makeReview("F-1", true));
    writeReviewJson(TEST_PROJECT_DIR, "F-2", makeReview("F-2", true));

    const db = getDbInstance();
    const result = buildInbox(db, TEST_PROJECT_DIR);

    expect(result.suggestedBatchApprove).not.toBeNull();
    expect(result.suggestedBatchApprove).toContain("F-1");
    expect(result.suggestedBatchApprove).toContain("F-2");
  });

  it("should detect acceptance test files", () => {
    addFeature({ id: "F-1", name: "Auth", description: "Desc", priority: 1 });
    insertPendingGate("F-1");

    // Create acceptance test file
    const hardenDir = join(TEST_PROJECT_DIR, ".specify", "harden", "f-1");
    mkdirSync(hardenDir, { recursive: true });
    writeFileSync(join(hardenDir, "acceptance-test.md"), "# AT\n");

    const db = getDbInstance();
    const result = buildInbox(db, TEST_PROJECT_DIR);

    expect(result.queue[0].acceptanceTestPath).not.toBeNull();
    expect(result.queue[0].acceptanceTestPath).toContain("acceptance-test.md");
  });
});

// =============================================================================
// Renderers
// =============================================================================

describe("renderCompactInbox", () => {
  it("should render empty state message", () => {
    const result: import("../../src/types").InboxResult = {
      queue: [],
      summary: { total: 0, p0: 0, p1: 0, p2: 0 },
      suggestedBatchApprove: null,
    };
    const output = renderCompactInbox(result);
    expect(output).toContain("Inbox empty");
  });

  it("should render table with items", () => {
    const result: import("../../src/types").InboxResult = {
      queue: [
        {
          featureId: "F-1",
          name: "Auth",
          priority: "P0",
          verdict: "NEEDS ATTENTION",
          verdictDetail: [],
          timeInQueue: "4h ago",
          timeInQueueMs: 4 * 60 * 60_000,
          reviewPath: "/tmp/review.json",
          acceptanceTestPath: null,
          decision: "Review failures",
        },
      ],
      summary: { total: 1, p0: 1, p1: 0, p2: 0 },
      suggestedBatchApprove: null,
    };

    const output = renderCompactInbox(result);
    expect(output).toContain("Review Inbox (1 items)");
    expect(output).toContain("PRI");
    expect(output).toContain("FEATURE");
    expect(output).toContain("P0");
    expect(output).toContain("F-1");
    expect(output).toContain("Auth");
    expect(output).toContain("4h ago");
  });

  it("should show batch approve suggestion", () => {
    const result: import("../../src/types").InboxResult = {
      queue: [
        {
          featureId: "F-1",
          name: "Auth",
          priority: "P1",
          verdict: "ALL PASS",
          verdictDetail: [],
          timeInQueue: "2h ago",
          timeInQueueMs: 2 * 60 * 60_000,
          reviewPath: "/tmp/review.json",
          acceptanceTestPath: null,
          decision: "Safe to approve",
        },
        {
          featureId: "F-2",
          name: "CRUD",
          priority: "P1",
          verdict: "ALL PASS",
          verdictDetail: [],
          timeInQueue: "1h ago",
          timeInQueueMs: 1 * 60 * 60_000,
          reviewPath: "/tmp/review.json",
          acceptanceTestPath: null,
          decision: "Safe to approve",
        },
      ],
      summary: { total: 2, p0: 0, p1: 2, p2: 0 },
      suggestedBatchApprove: "specflow approve F-1 F-2",
    };

    const output = renderCompactInbox(result);
    expect(output).toContain("Batch approve:");
    expect(output).toContain("specflow approve F-1 F-2");
  });
});

describe("renderVerboseInbox", () => {
  it("should render empty state message", () => {
    const result: import("../../src/types").InboxResult = {
      queue: [],
      summary: { total: 0, p0: 0, p1: 0, p2: 0 },
      suggestedBatchApprove: null,
    };
    expect(renderVerboseInbox(result)).toContain("Inbox empty");
  });

  it("should render expanded view with file paths", () => {
    const result: import("../../src/types").InboxResult = {
      queue: [
        {
          featureId: "F-1",
          name: "Auth",
          priority: "P0",
          verdict: "NEEDS ATTENTION",
          verdictDetail: ["Automated checks: FAIL", "  2 file(s) missing"],
          timeInQueue: "4h ago",
          timeInQueueMs: 4 * 60 * 60_000,
          reviewPath: "/tmp/review/f-1/review.json",
          acceptanceTestPath: "/tmp/harden/f-1/acceptance-test.md",
          decision: "Review failures before approving",
        },
      ],
      summary: { total: 1, p0: 1, p1: 0, p2: 0 },
      suggestedBatchApprove: null,
    };

    const output = renderVerboseInbox(result);
    expect(output).toContain("P0 F-1: Auth");
    expect(output).toContain("Verdict: NEEDS ATTENTION");
    expect(output).toContain("Automated checks: FAIL");
    expect(output).toContain("Decision:");
    expect(output).toContain("Review:");
    expect(output).toContain("AT File:");
  });
});

describe("renderJsonInbox", () => {
  it("should return valid JSON", () => {
    const result: import("../../src/types").InboxResult = {
      queue: [],
      summary: { total: 0, p0: 0, p1: 0, p2: 0 },
      suggestedBatchApprove: null,
    };
    const output = renderJsonInbox(result);
    const parsed = JSON.parse(output);
    expect(parsed.queue).toHaveLength(0);
    expect(parsed.summary.total).toBe(0);
  });
});
