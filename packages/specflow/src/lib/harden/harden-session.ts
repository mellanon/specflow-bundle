/**
 * Harden Session Engine
 * Interactive test execution loop with operator steering
 */

import { createInterface } from "readline";
import { spawnSync } from "child_process";
import type { Database } from "bun:sqlite";
import type { HardenTestCase, HardenSession } from "../../types";
import { writeProtocol } from "./protocol-writer";

export interface InteractiveSessionOptions {
  only?: string[];  // Only run these TC IDs
  from?: string;    // Resume from this TC ID
}

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
  featureName: string,
  options: InteractiveSessionOptions = {}
): Promise<HardenSession> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const prompt = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  let passed = session.passed;
  let failed = session.failed;
  let skipped = session.skipped;

  // Build set of selected test IDs
  const selectedIds = options.only ? new Set(options.only.map(id => id.toUpperCase())) : null;
  const fromId = options.from?.toUpperCase();

  console.log(`\n  ${"═".repeat(50)}`);
  console.log(`  HARDEN SESSION: ${featureName}`);
  console.log(`  ${"═".repeat(50)}`);
  console.log(`  ${testCases.length} test cases total`);
  if (selectedIds) {
    console.log(`  Running: ${[...selectedIds].join(", ")}`);
  }
  console.log(`\n  Commands:`);
  console.log(`    [P]ass   - Test passed (optional note)`);
  console.log(`    [F]ail   - Test failed (note required)`);
  console.log(`    [S]kip   - Skip this test (optional note)`);
  console.log(`    [R]un    - Execute automated steps`);
  console.log(`    [Q]uit   - Save and exit\n`);

  // Find start index
  let i = startFrom;
  if (fromId) {
    const fromIndex = testCases.findIndex(tc => tc.id.toUpperCase() === fromId);
    if (fromIndex >= 0) i = fromIndex;
  }

  while (i < testCases.length) {
    const tc = testCases[i];

    // Skip if not in selected list
    if (selectedIds && !selectedIds.has(tc.id.toUpperCase())) {
      if (tc.status === "pending") {
        tc.status = "skipped";
        tc.notes = "Not selected";
        tc.executedAt = new Date().toISOString();
        skipped++;
        updateTestCase(db, session.id, tc);
        console.log(`  \x1b[90m${tc.id}: skipped (not selected)\x1b[0m`);
      }
      i++;
      continue;
    }

    if (tc.status !== "pending") {
      i++;
      continue;
    }

    console.log(`\n  ${"─".repeat(50)}`);
    console.log(`  \x1b[1m${tc.id}: ${tc.description}\x1b[0m`);
    console.log(`  ${"─".repeat(50)}`);
    console.log(`  Source: ${tc.source}`);
    console.log(`  Type: \x1b[36m${tc.type}\x1b[0m`);
    if (tc.preconditions.length > 0) {
      console.log(`  Preconditions:`);
      tc.preconditions.forEach(p => console.log(`    • ${p}`));
    }
    console.log(`  Steps:`);
    for (let s = 0; s < tc.steps.length; s++) {
      console.log(`    ${s + 1}. ${tc.steps[s]}`);
    }
    console.log(`  Expected: ${tc.expectedResult}`);
    console.log("");

    // Show appropriate prompt based on test type
    const isAutomated = tc.type === "automated";
    const promptText = isAutomated
      ? "  [P]ass | [F]ail | [S]kip | [R]un | [Q]uit: "
      : "  [P]ass | [F]ail | [S]kip | [Q]uit: ";

    const answer = await prompt(promptText);
    const cmd = answer.trim().toLowerCase();

    if (cmd === "pass" || cmd === "p") {
      const notes = await prompt("  Note (optional, Enter to skip): ");
      tc.status = "pass";
      tc.notes = notes.trim() || null;
      tc.executedAt = new Date().toISOString();
      passed++;
      updateTestCase(db, session.id, tc);
      console.log(`  >> \x1b[32m${tc.id}: PASS\x1b[0m${tc.notes ? ` - ${tc.notes}` : ""}`);
      i++;
    } else if (cmd === "fail" || cmd === "f") {
      let notes = "";
      while (!notes.trim()) {
        notes = await prompt("  Why did it fail? (required): ");
      }
      tc.status = "fail";
      tc.notes = notes.trim();
      tc.executedAt = new Date().toISOString();
      failed++;
      updateTestCase(db, session.id, tc);
      console.log(`  >> \x1b[31m${tc.id}: FAIL\x1b[0m - ${tc.notes}`);
      i++;
    } else if (cmd === "skip" || cmd === "s") {
      const notes = await prompt("  Reason (optional, Enter to skip): ");
      tc.status = "skipped";
      tc.notes = notes.trim() || null;
      tc.executedAt = new Date().toISOString();
      skipped++;
      updateTestCase(db, session.id, tc);
      console.log(`  >> \x1b[33m${tc.id}: SKIPPED\x1b[0m${tc.notes ? ` - ${tc.notes}` : ""}`);
      i++;
    } else if ((cmd === "run" || cmd === "r") && isAutomated) {
      // Execute automated test steps
      console.log(`\n  \x1b[36mExecuting automated steps...\x1b[0m`);
      const result = executeAutomatedSteps(tc.steps, process.cwd());
      console.log(result.output);
      console.log(result.success ? "  \x1b[32m✓ Commands succeeded\x1b[0m" : "  \x1b[31m✗ Commands failed\x1b[0m");
      console.log(`\n  Now mark the result: [P]ass | [F]ail | [S]kip`);
      // Don't advance - let user mark the result
      continue;
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

/**
 * Execute automated test steps and return results
 */
function executeAutomatedSteps(
  steps: string[],
  projectPath: string
): { success: boolean; output: string } {
  const outputs: string[] = [];

  for (const step of steps) {
    const command = extractCommand(step);
    if (!command) {
      outputs.push(`  Step: ${step} (no command)`);
      continue;
    }

    outputs.push(`  $ ${command}`);
    const result = spawnSync("sh", ["-c", command], {
      cwd: projectPath,
      encoding: "utf-8",
      timeout: 30000,
    });

    const output = ((result.stdout || "") + (result.stderr || "")).trim();
    if (output) {
      outputs.push(`    ${output.split("\n").join("\n    ")}`);
    }

    if (result.status !== 0) {
      outputs.push(`    \x1b[31mExit code: ${result.status}\x1b[0m`);
      return { success: false, output: outputs.join("\n") };
    }
  }

  return { success: true, output: outputs.join("\n") };
}

/**
 * Extract command from step text
 * Matches: `command`, "run: command", "the operator runs `command`"
 */
function extractCommand(step: string): string | null {
  // Match `command` in backticks
  const backtickMatch = step.match(/`([^`]+)`/);
  if (backtickMatch) return backtickMatch[1];

  // Match "Run: command" or "Execute: command"
  const runMatch = step.match(/(?:run|execute|invoke):\s*(.+)/i);
  if (runMatch) return runMatch[1].trim();

  // Match "runs/executes `command`"
  const verbMatch = step.match(/(?:runs?|executes?)\s+`([^`]+)`/i);
  if (verbMatch) return verbMatch[1];

  return null;
}
