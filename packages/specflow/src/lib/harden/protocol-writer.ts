/**
 * Protocol Writer/Reader
 * Generates and parses protocol.md for harden sessions
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import type { HardenTestCase } from "../../types";

/**
 * Compute MD5 hash of spec content for staleness detection
 */
export function computeSpecHash(specPath: string): string {
  const content = readFileSync(specPath, "utf-8");
  return createHash("md5").update(content).digest("hex");
}

/**
 * Write protocol.md from test cases
 */
export function writeProtocol(
  outputDir: string,
  featureId: string,
  featureName: string,
  testCases: HardenTestCase[],
  specHash: string
): string {
  mkdirSync(outputDir, { recursive: true });
  const protocolPath = join(outputDir, "protocol.md");

  let md = `# Test Protocol: ${featureId} — ${featureName}\n\n`;
  md += `<!-- specHash: ${specHash} -->\n`;
  md += `<!-- generated: ${new Date().toISOString()} -->\n\n`;

  for (const tc of testCases) {
    md += `### ${tc.id}: ${tc.description}\n\n`;
    md += `- **Source:** ${tc.source}\n`;
    md += `- **Type:** ${tc.type}\n`;
    if (tc.preconditions.length > 0) {
      md += `- **Preconditions:** ${tc.preconditions.join("; ")}\n`;
    }
    md += `- **Steps:**\n`;
    for (let i = 0; i < tc.steps.length; i++) {
      md += `  ${i + 1}. ${tc.steps[i]}\n`;
    }
    md += `- **Expected Result:** ${tc.expectedResult}\n`;
    md += `- **Status:** ${tc.status}\n`;
    if (tc.notes) {
      md += `- **Notes:** ${tc.notes}\n`;
    }
    md += "\n";
  }

  // Atomic write
  const tmpPath = protocolPath + ".tmp";
  writeFileSync(tmpPath, md);
  renameSync(tmpPath, protocolPath);

  return protocolPath;
}

/**
 * Read protocol.md back into test cases
 */
export function readProtocol(protocolPath: string): HardenTestCase[] {
  if (!existsSync(protocolPath)) return [];

  const content = readFileSync(protocolPath, "utf-8");
  const testCases: HardenTestCase[] = [];

  // Parse ### TC-N: Description blocks
  const tcRegex = /### (TC-\d+):\s*(.+?)(?=\n)/g;
  let match;
  const positions: Array<{ id: string; desc: string; start: number }> = [];

  while ((match = tcRegex.exec(content)) !== null) {
    positions.push({ id: match[1], desc: match[2].trim(), start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start;
    const end = i + 1 < positions.length ? positions[i + 1].start : content.length;
    const block = content.substring(start, end);

    const sourceMatch = block.match(/\*\*Source:\*\*\s*(.+)/);
    const typeMatch = block.match(/\*\*Type:\*\*\s*(.+)/);
    const preMatch = block.match(/\*\*Preconditions:\*\*\s*(.+)/);
    const expectedMatch = block.match(/\*\*Expected Result:\*\*\s*(.+)/);
    const statusMatch = block.match(/\*\*Status:\*\*\s*(.+)/);
    const notesMatch = block.match(/\*\*Notes:\*\*\s*(.+)/);

    // Parse steps
    const steps: string[] = [];
    const stepsRegex = /^\s+\d+\.\s+(.+)/gm;
    let stepMatch;
    while ((stepMatch = stepsRegex.exec(block)) !== null) {
      steps.push(stepMatch[1].trim());
    }

    testCases.push({
      id: positions[i].id,
      description: positions[i].desc,
      source: sourceMatch?.[1]?.trim() || "unknown",
      type: (typeMatch?.[1]?.trim() as any) || "manual",
      preconditions: preMatch ? preMatch[1].split(";").map((s) => s.trim()) : [],
      steps,
      expectedResult: expectedMatch?.[1]?.trim() || "",
      status: (statusMatch?.[1]?.trim() as any) || "pending",
      notes: notesMatch?.[1]?.trim() || null,
      executedAt: null,
    });
  }

  return testCases;
}

/**
 * Read the specHash from an existing protocol
 */
export function readProtocolSpecHash(protocolPath: string): string | null {
  if (!existsSync(protocolPath)) return null;
  const content = readFileSync(protocolPath, "utf-8");
  const match = content.match(/<!-- specHash: (\w+) -->/);
  return match?.[1] || null;
}
