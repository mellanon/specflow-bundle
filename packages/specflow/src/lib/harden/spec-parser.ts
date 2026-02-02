/**
 * Spec Parser for Harden
 * Extracts testable criteria from spec.md
 */

import { readFileSync } from "fs";
import type { HardenTestCase, TestType } from "../../types";

/**
 * Classify test type heuristically from description text
 */
function classifyTestType(text: string): TestType {
  const lower = text.toLowerCase();
  if (/\bcli\b|\bcommand\b|\brun\b.*specflow\b|\bterminal\b/.test(lower)) return "automated";
  if (/\bbrowser\b|\bui\b|\bvisual\b|\bplaywright\b/.test(lower)) return "automated";
  if (/\bverify\b|\bconfirm\b|\bfeel\b|\breview\b|\bmanual\b/.test(lower)) return "manual";
  return "hybrid";
}

/**
 * Parse User Scenarios section (Given/When/Then blocks)
 */
function parseScenarios(content: string): Array<{ title: string; given: string; when: string; then: string }> {
  const scenarios: Array<{ title: string; given: string; when: string; then: string }> = [];

  // Match ### Scenario N: title
  const scenarioRegex = /###\s+Scenario\s+\d+:\s*(.+?)(?=\n)/g;
  let match;
  const positions: Array<{ title: string; start: number }> = [];

  while ((match = scenarioRegex.exec(content)) !== null) {
    positions.push({ title: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : content.length;
    const block = content.substring(start, end);

    const givenMatch = block.match(/\*\*Given\*\*\s*(.+?)(?=\n\s*-\s*\*\*When\*\*|\n\n)/s);
    const whenMatch = block.match(/\*\*When\*\*\s*(.+?)(?=\n\s*-\s*\*\*Then\*\*|\n\n)/s);
    const thenMatch = block.match(/\*\*Then\*\*\s*(.+?)(?=\n\s*-\s*\*\*(?:And|Given|When)\*\*|\n###|\n##|\n\n\n|$)/s);

    // Also match - **Given/When/Then** style
    const givenAlt = block.match(/-\s*\*\*Given\*\*\s*(.+?)(?=-\s*\*\*When\*\*|$)/s);
    const whenAlt = block.match(/-\s*\*\*When\*\*\s*(.+?)(?=-\s*\*\*Then\*\*|$)/s);
    const thenLines: string[] = [];
    const thenRegex = /-\s*\*\*Then\*\*\s*(.+)/g;
    const andRegex = /-\s*\*\*And\*\*\s*(.+)/g;
    let thenM;
    while ((thenM = thenRegex.exec(block)) !== null) thenLines.push(thenM[1].trim());
    let andM;
    while ((andM = andRegex.exec(block)) !== null) thenLines.push(andM[1].trim());

    scenarios.push({
      title: positions[i].title,
      given: (givenMatch?.[1] || givenAlt?.[1] || "").trim(),
      when: (whenMatch?.[1] || whenAlt?.[1] || "").trim(),
      then: thenLines.length > 0 ? thenLines.join("; ") : (thenMatch?.[1] || "").trim(),
    });
  }

  return scenarios;
}

/**
 * Parse Functional Requirements table
 */
function parseFRTable(content: string): Array<{ id: string; requirement: string; priority: string }> {
  const frs: Array<{ id: string; requirement: string; priority: string }> = [];

  // Find the FR table
  const tableRegex = /\|\s*ID\s*\|\s*Requirement\s*\|\s*Priority\s*\|.*?\n\|[-\s|]+\n([\s\S]*?)(?=\n\n|\n##|$)/;
  const tableMatch = content.match(tableRegex);
  if (!tableMatch) return frs;

  const rows = tableMatch[1].split("\n").filter((r) => r.trim().startsWith("|"));
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length >= 3) {
      frs.push({
        id: cells[0],
        requirement: cells[1],
        priority: cells[2],
      });
    }
  }

  return frs;
}

/**
 * Parse a spec.md file and extract test cases
 */
export function parseSpec(specPath: string): HardenTestCase[] {
  const content = readFileSync(specPath, "utf-8");
  const testCases: HardenTestCase[] = [];
  let tcNum = 1;

  // Extract from scenarios
  const scenarios = parseScenarios(content);
  for (const scenario of scenarios) {
    const description = scenario.title;
    const allText = `${scenario.given} ${scenario.when} ${scenario.then}`;

    testCases.push({
      id: `TC-${tcNum++}`,
      description,
      source: `Scenario: ${scenario.title}`,
      type: classifyTestType(allText),
      preconditions: scenario.given ? [scenario.given] : [],
      steps: scenario.when ? [scenario.when] : [],
      expectedResult: scenario.then || "Verify expected behavior",
      status: "pending",
      notes: null,
      executedAt: null,
    });
  }

  // Extract from FR table (High and Medium priority only)
  const frs = parseFRTable(content);
  for (const fr of frs) {
    if (fr.priority === "High" || fr.priority === "Medium") {
      testCases.push({
        id: `TC-${tcNum++}`,
        description: fr.requirement,
        source: fr.id,
        type: classifyTestType(fr.requirement),
        preconditions: [],
        steps: [`Verify: ${fr.requirement}`],
        expectedResult: "Requirement is satisfied",
        status: "pending",
        notes: null,
        executedAt: null,
      });
    }
  }

  return testCases;
}
