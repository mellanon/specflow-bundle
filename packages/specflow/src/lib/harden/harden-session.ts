/**
 * Harden Session Engine
 * Interactive test execution loop with operator steering
 */

import { createInterface } from "readline";
import type { Database } from "bun:sqlite";
import type { HardenTestCase, HardenSession } from "../../types";
import { writeProtocol } from "./protocol-writer";
import { evaluateTestCase } from "./headless-evaluator";

/**
 * Create a new harden session in the database
 */
export function createSession(
  db: Database,
  featureId: string,
  testCases: HardenTestCase[],
  protocolPath: string
): HardenSession {
  const now = new Date().toISOString();

  const result = db.run(
    `INSERT INTO harden_sessions (feature_id, started_at, result, total_tests, protocol_path)
     VALUES (?, ?, 'incomplete', ?, ?)`,
    [featureId, now, testCases.length, protocolPath]
  );

  const sessionId = Number(result.lastInsertRowid);

  // Insert test cases
  for (const tc of testCases) {
    db.run(
      `INSERT INTO harden_test_cases (session_id, test_id, description, source, test_type, preconditions, steps, expected_result, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        tc.id,
        tc.description,
        tc.source,
        tc.type,
        JSON.stringify(tc.preconditions),
        JSON.stringify(tc.steps),
        tc.expectedResult,
        tc.status,
      ]
    );
  }

  return {
    id: sessionId,
    featureId,
    startedAt: now,
    completedAt: null,
    result: "incomplete",
    totalTests: testCases.length,
    passed: 0,
    failed: 0,
    skipped: 0,
  };
}

/**
 * Find an incomplete session for a feature
 */
export function findIncompleteSession(
  db: Database,
  featureId: string
): { session: HardenSession; testCases: HardenTestCase[]; resumeFrom: number } | null {
  const row = db.query(
    `SELECT * FROM harden_sessions WHERE feature_id = ? AND result = 'incomplete' ORDER BY id DESC LIMIT 1`
  ).get(featureId) as any;

  if (!row) return null;

  const tcRows = db.query(
    `SELECT * FROM harden_test_cases WHERE session_id = ? ORDER BY id ASC`
  ).all(row.id) as any[];

  const testCases: HardenTestCase[] = tcRows.map((r: any) => ({
    id: r.test_id,
    description: r.description,
    source: r.source,
    type: r.test_type,
    preconditions: JSON.parse(r.preconditions || "[]"),
    steps: JSON.parse(r.steps || "[]"),
    expectedResult: r.expected_result,
    status: r.status,
    notes: r.notes,
    executedAt: r.executed_at,
  }));

  // Find first pending test
  const resumeFrom = testCases.findIndex((tc) => tc.status === "pending");

  return {
    session: {
      id: row.id,
      featureId: row.feature_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result,
      totalTests: row.total_tests,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
    },
    testCases,
    resumeFrom: resumeFrom >= 0 ? resumeFrom : testCases.length,
  };
}

/**
 * Run the interactive session loop
 */
export async function runInteractiveSession(
  db: Database,
  session: HardenSession,
  testCases: HardenTestCase[],
  startFrom: number,
  outputDir: string,
  featureName: string
): Promise<HardenSession> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  let passed = session.passed;
  let failed = session.failed;
  let skipped = session.skipped;

  console.log(`\n  Harden session started. ${testCases.length - startFrom} tests remaining.\n`);
  console.log("  Commands: pass(p), fail(f), skip(s), retry(r), add, status, quit(q)\n");

  let i = startFrom;
  while (i < testCases.length) {
    const tc = testCases[i];
    if (tc.status !== "pending") {
      i++;
      continue;
    }

    console.log(`\n  ${"=".repeat(50)}`);
    console.log(`  ${tc.id}: ${tc.description}`);
    console.log(`  ${"=".repeat(50)}`);
    console.log(`  Source: ${tc.source}`);
    console.log(`  Type: ${tc.type}`);
    if (tc.preconditions.length > 0) {
      console.log(`  Preconditions: ${tc.preconditions.join("; ")}`);
    }
    console.log(`  Steps:`);
    for (let s = 0; s < tc.steps.length; s++) {
      console.log(`    ${s + 1}. ${tc.steps[s]}`);
    }
    console.log(`  Expected: ${tc.expectedResult}`);
    console.log("");

    const answer = await prompt("  Verdict [pass/fail/skip/retry/add/status/quit]: ");
    const cmd = answer.trim().toLowerCase();

    if (cmd === "pass" || cmd === "p") {
      tc.status = "pass";
      tc.executedAt = new Date().toISOString();
      passed++;
      updateTestCase(db, session.id, tc);
      console.log(`  >> ${tc.id}: PASS`);
      i++;
    } else if (cmd === "fail" || cmd === "f") {
      const notes = await prompt("  Notes (failure detail): ");
      tc.status = "fail";
      tc.notes = notes.trim() || null;
      tc.executedAt = new Date().toISOString();
      failed++;
      updateTestCase(db, session.id, tc);
      console.log(`  >> ${tc.id}: FAIL`);
      i++;
    } else if (cmd === "skip" || cmd === "s") {
      tc.status = "skipped";
      tc.executedAt = new Date().toISOString();
      skipped++;
      updateTestCase(db, session.id, tc);
      console.log(`  >> ${tc.id}: SKIPPED`);
      i++;
    } else if (cmd === "retry" || cmd === "r") {
      // Just re-display the same test
      continue;
    } else if (cmd.startsWith("add ")) {
      const desc = cmd.substring(4).trim();
      if (desc) {
        const newTc: HardenTestCase = {
          id: `TC-${testCases.length + 1}`,
          description: desc,
          source: "ad-hoc",
          type: "manual",
          preconditions: [],
          steps: [`Verify: ${desc}`],
          expectedResult: "Verify expected behavior",
          status: "pending",
          notes: null,
          executedAt: null,
        };
        testCases.push(newTc);
        insertTestCase(db, session.id, newTc);
        console.log(`  >> Added ${newTc.id}: ${desc}`);
      }
    } else if (cmd === "status") {
      const pending = testCases.filter((t) => t.status === "pending").length;
      console.log(`\n  Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped} | Pending: ${pending}\n`);
    } else if (cmd === "quit" || cmd === "q") {
      console.log("\n  Session paused. Run 'specflow harden' again to resume.\n");
      break;
    } else {
      console.log("  Unknown command. Try: pass, fail, skip, retry, add <desc>, status, quit");
    }

    // Update protocol file after each verdict
    writeProtocol(outputDir, session.featureId, featureName, testCases, "");
  }

  rl.close();

  // Determine result
  const allDone = testCases.every((tc) => tc.status !== "pending");
  const result = allDone ? (failed > 0 ? "fail" : "pass") : "incomplete";

  // Update session
  const now = allDone ? new Date().toISOString() : null;
  db.run(
    `UPDATE harden_sessions SET result = ?, passed = ?, failed = ?, skipped = ?, total_tests = ?, completed_at = ? WHERE id = ?`,
    [result, passed, failed, skipped, testCases.length, now, session.id]
  );

  return {
    ...session,
    result: result as any,
    passed,
    failed,
    skipped,
    totalTests: testCases.length,
    completedAt: now,
  };
}

/**
 * Run headless (autonomous) session using claude -p for evaluation
 */
export async function runHeadlessSession(
  db: Database,
  session: HardenSession,
  testCases: HardenTestCase[],
  startFrom: number,
  outputDir: string,
  featureName: string,
  projectPath: string,
  specPath: string
): Promise<HardenSession> {
  let passed = session.passed;
  let failed = session.failed;
  let skipped = session.skipped;

  console.log(`\n  Headless session: ${testCases.length - startFrom} tests to evaluate.\n`);

  for (let i = startFrom; i < testCases.length; i++) {
    const tc = testCases[i];
    if (tc.status !== "pending") continue;

    process.stdout.write(`  ${tc.id}: ${tc.description.slice(0, 60)}... `);

    const verdict = evaluateTestCase(projectPath, session.featureId, specPath, tc);

    tc.status = verdict.status === "pass" ? "pass" : verdict.status === "fail" ? "fail" : "skipped";
    tc.notes = [verdict.evidence, verdict.notes].filter(Boolean).join(" | ");
    tc.executedAt = new Date().toISOString();

    if (verdict.status === "pass") passed++;
    else if (verdict.status === "fail") failed++;
    else skipped++;

    updateTestCase(db, session.id, tc);
    console.log(verdict.status === "pass" ? "PASS" : verdict.status === "fail" ? "FAIL" : "SKIP");

    // Update protocol file
    writeProtocol(outputDir, session.featureId, featureName, testCases, "");
  }

  const result = failed > 0 ? "fail" : "pass";
  const now = new Date().toISOString();

  db.run(
    `UPDATE harden_sessions SET result = ?, passed = ?, failed = ?, skipped = ?, total_tests = ?, completed_at = ? WHERE id = ?`,
    [result, passed, failed, skipped, testCases.length, now, session.id]
  );

  console.log(`\n  Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

  return {
    ...session,
    result: result as any,
    passed,
    failed,
    skipped,
    totalTests: testCases.length,
    completedAt: now,
  };
}

function updateTestCase(db: Database, sessionId: number, tc: HardenTestCase): void {
  db.run(
    `UPDATE harden_test_cases SET status = ?, notes = ?, executed_at = ? WHERE session_id = ? AND test_id = ?`,
    [tc.status, tc.notes, tc.executedAt, sessionId, tc.id]
  );
}

function insertTestCase(db: Database, sessionId: number, tc: HardenTestCase): void {
  db.run(
    `INSERT INTO harden_test_cases (session_id, test_id, description, source, test_type, preconditions, steps, expected_result, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, tc.id, tc.description, tc.source, tc.type, JSON.stringify(tc.preconditions), JSON.stringify(tc.steps), tc.expectedResult, tc.status]
  );
}
