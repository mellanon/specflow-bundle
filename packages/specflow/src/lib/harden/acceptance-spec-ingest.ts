/**
 * Acceptance Test Ingest
 *
 * Parses a filled-in acceptance-test.md template to extract per-AT results.
 * Writes structured results to .specify/harden/{featureId}/results.json.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync } from "fs";
import { join } from "path";

// =============================================================================
// Types
// =============================================================================

export interface ATResult {
  id: string;
  title: string;
  status: "pass" | "fail" | "skip" | "pending";
  evidence: EvidenceEntry[];
  findings: string;
}

export interface EvidenceEntry {
  criterion: string;
  pass: boolean | null;
  evidenceType: string;
  evidence: string;
}

export interface HardenResults {
  featureId: string;
  ingestedAt: string;
  source: string;
  tests: ATResult[];
  summary: {
    total: number;
    pass: number;
    fail: number;
    skip: number;
    pending: number;
  };
}

export interface EnrichedHardenResults extends HardenResults {
  iteration: number;
  delta: {
    passChange: number;
    failChange: number;
    fixedTests: string[];   // AT IDs that went fail->pass
    brokenTests: string[];  // AT IDs that went pass->fail
  } | null;
  previousIngestedAt: string | null;
}

// =============================================================================
// Parser
// =============================================================================

/**
 * Parse a filled acceptance-test.md and extract results for each AT
 */
export function parseAcceptanceTestResults(content: string): ATResult[] {
  const results: ATResult[] = [];

  // Split into AT sections: ## AT-N: Title
  const atSections = content.split(/^## (AT-\d+):\s*/m);

  // atSections[0] is the preamble (before first AT), then pairs of [id, content]
  for (let i = 1; i < atSections.length; i += 2) {
    const id = atSections[i];
    const sectionContent = atSections[i + 1] || "";

    // Extract title (first line of section content)
    const titleLine = sectionContent.split("\n")[0]?.trim() || "";

    // Extract status from **Status:** `pass` / `fail` / `skip`
    // The unfilled template has all three options on one line: `pass` / `fail` / `skip`
    // A filled-in template has only one: `pass` or `fail` or `skip`
    const statusLine = sectionContent.match(/\*\*Status:\*\*\s*([^\n]*)/i);
    let status: "pass" | "fail" | "skip" | "pending" = "pending";
    if (statusLine) {
      const line = statusLine[1].trim();
      // If line contains " / " it's the unfilled template — treat as pending
      if (!line.includes(" / ")) {
        const statusMatch = line.match(/`?(pass|fail|skip)`?/i);
        if (statusMatch) {
          status = statusMatch[1].toLowerCase() as "pass" | "fail" | "skip";
        }
      }
    }

    // Extract evidence table entries
    const evidence = parseEvidenceTable(sectionContent);

    // Extract findings — may be on same line or following lines
    const findingsMatch = sectionContent.match(
      /\*\*Findings:\*\*\s*(?:\*[^*]*\*)?\s*([\s\S]*?)(?=\n---|\n## |$)/
    );
    const findings = findingsMatch ? findingsMatch[1].trim() : "";

    results.push({
      id,
      title: titleLine,
      status,
      evidence,
      findings,
    });
  }

  return results;
}

/**
 * Parse the evidence table from an AT section
 */
function parseEvidenceTable(content: string): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];

  // Match table rows after the header (skip header + separator)
  const tableMatch = content.match(
    /\*\*Evidence:\*\*[^\n]*\n\|[^\n]+\|\n\|[-| ]+\|\n([\s\S]*?)(?=\n\n|\n\*\*|\n##|$)/
  );
  if (!tableMatch) return entries;

  const rows = tableMatch[1].split("\n").filter((line) => line.trim().startsWith("|"));
  for (const row of rows) {
    const cells = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    if (cells.length >= 4 && !cells[0].startsWith("*")) {
      const passStr = cells[1].toLowerCase();
      entries.push({
        criterion: cells[0],
        pass: passStr === "yes" || passStr === "y" || passStr === "true"
          ? true
          : passStr === "no" || passStr === "n" || passStr === "false"
            ? false
            : null,
        evidenceType: cells[2],
        evidence: cells[3],
      });
    }
  }

  return entries;
}

// =============================================================================
// Results I/O
// =============================================================================

/**
 * Read and parse acceptance-test.md, write results.json with history preservation.
 * Each ingest is saved as a timestamped history file with delta computation.
 */
export function ingestAcceptanceTests(
  projectPath: string,
  featureId: string
): EnrichedHardenResults {
  const dir = join(projectPath, ".specify", "harden", featureId.toLowerCase());
  const acceptanceTestPath = join(dir, "acceptance-test.md");

  if (!existsSync(acceptanceTestPath)) {
    throw new Error(
      `No acceptance-test.md found at ${acceptanceTestPath}. Run 'specflow harden ${featureId}' first to generate it.`
    );
  }

  const content = readFileSync(acceptanceTestPath, "utf-8");
  const tests = parseAcceptanceTestResults(content);

  const summary = {
    total: tests.length,
    pass: tests.filter((t) => t.status === "pass").length,
    fail: tests.filter((t) => t.status === "fail").length,
    skip: tests.filter((t) => t.status === "skip").length,
    pending: tests.filter((t) => t.status === "pending").length,
  };

  const results: HardenResults = {
    featureId,
    ingestedAt: new Date().toISOString(),
    source: acceptanceTestPath,
    tests,
    summary,
  };

  // Load previous results for delta computation
  const previousResults = readHardenResults(projectPath, featureId);

  // Determine iteration number from history
  const historyDir = join(dir, "history");
  mkdirSync(historyDir, { recursive: true });
  const existingRuns = readdirSync(historyDir).filter((f) => f.endsWith(".json")).length;
  const iteration = existingRuns + 1;

  // Compute delta
  let delta: EnrichedHardenResults["delta"] = null;
  if (previousResults) {
    const prevById = new Map(previousResults.tests.map((t) => [t.id, t.status]));
    const fixedTests: string[] = [];
    const brokenTests: string[] = [];

    for (const test of tests) {
      const prevStatus = prevById.get(test.id);
      if (prevStatus === "fail" && test.status === "pass") {
        fixedTests.push(test.id);
      } else if (prevStatus === "pass" && test.status === "fail") {
        brokenTests.push(test.id);
      }
    }

    delta = {
      passChange: summary.pass - previousResults.summary.pass,
      failChange: summary.fail - previousResults.summary.fail,
      fixedTests,
      brokenTests,
    };
  }

  const enriched: EnrichedHardenResults = {
    ...results,
    iteration,
    delta,
    previousIngestedAt: previousResults?.ingestedAt || null,
  };

  // Write timestamped history file (append-only)
  const timestamp = results.ingestedAt.replace(/[:.]/g, "-");
  const historyPath = join(historyDir, `${timestamp}_run${iteration}.json`);
  atomicWriteJson(historyPath, enriched);

  // Write latest results.json (overwrite for quick access)
  const resultsPath = join(dir, "results.json");
  atomicWriteJson(resultsPath, enriched);

  return enriched;
}

/**
 * Atomically write JSON to a file (write .tmp then rename)
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, filePath);
}

/**
 * Read results.json for a feature, returning null if missing
 */
export function readHardenResults(
  projectPath: string,
  featureId: string
): HardenResults | null {
  const filePath = join(
    projectPath,
    ".specify",
    "harden",
    featureId.toLowerCase(),
    "results.json"
  );
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as HardenResults;
}

/**
 * Get acceptance test ingest history, ordered by iteration (oldest first)
 */
export function getHardenHistory(
  projectPath: string,
  featureId: string
): EnrichedHardenResults[] {
  const historyDir = join(
    projectPath,
    ".specify",
    "harden",
    featureId.toLowerCase(),
    "history"
  );

  if (!existsSync(historyDir)) return [];

  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const content = readFileSync(join(historyDir, file), "utf-8");
    return JSON.parse(content) as EnrichedHardenResults;
  });
}

/**
 * Get a summary of acceptance test progress across ingests
 */
export function getHardenProgressSummary(
  projectPath: string,
  featureId: string
): {
  totalIngests: number;
  firstIngest: { date: string; pass: number; fail: number } | null;
  latestIngest: { date: string; pass: number; fail: number; iteration: number } | null;
  trend: "improving" | "regressing" | "stable" | "unknown";
  passRateHistory: number[];
} | null {
  const history = getHardenHistory(projectPath, featureId);

  if (history.length === 0) return null;

  const passRateHistory = history.map((h) =>
    h.summary.total > 0
      ? ((h.summary.pass / h.summary.total) * 100)
      : 0
  );

  const first = history[0];
  const latest = history[history.length - 1];

  let trend: "improving" | "regressing" | "stable" | "unknown" = "unknown";
  if (history.length >= 2) {
    const recentRates = passRateHistory.slice(-3);
    const isImproving = recentRates.every((rate, i) => i === 0 || rate >= recentRates[i - 1]);
    const isRegressing = recentRates.every((rate, i) => i === 0 || rate <= recentRates[i - 1]);

    if (isImproving && recentRates[recentRates.length - 1] > recentRates[0]) {
      trend = "improving";
    } else if (isRegressing && recentRates[recentRates.length - 1] < recentRates[0]) {
      trend = "regressing";
    } else {
      trend = "stable";
    }
  }

  return {
    totalIngests: history.length,
    firstIngest: {
      date: first.ingestedAt,
      pass: first.summary.pass,
      fail: first.summary.fail,
    },
    latestIngest: {
      date: latest.ingestedAt,
      pass: latest.summary.pass,
      fail: latest.summary.fail,
      iteration: latest.iteration,
    },
    trend,
    passRateHistory,
  };
}
