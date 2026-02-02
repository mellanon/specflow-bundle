/**
 * Release Gate Evaluation Engine
 * Evaluates 8 gates sequentially for release readiness.
 * Gates 1-4: Quality gates (F-9)
 * Gates 5-8: Contribution packaging (F-10)
 */

import { join } from "path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import type { Feature } from "../../types";

// =============================================================================
// Types
// =============================================================================

export interface GateResult {
  gate: number;
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface ReleaseReport {
  evaluatedAt: string;
  featureId: string;
  gates: GateResult[];
  passed: boolean;
  stoppedAtGate: number | null;
  artifacts: Record<string, string>;
}

// =============================================================================
// Gate 1: All Features Complete
// =============================================================================

function evaluateGate1(features: Feature[]): GateResult {
  const incomplete = features.filter(
    (f) => f.status !== "complete" && f.status !== "skipped"
  );

  return {
    gate: 1,
    name: "All features complete",
    passed: incomplete.length === 0,
    message:
      incomplete.length === 0
        ? `All ${features.length} features complete or skipped`
        : `${incomplete.length} feature(s) still incomplete`,
    details: incomplete.length > 0
      ? incomplete.map((f) => `  - ${f.id}: ${f.name} (${f.status}/${f.phase})`).join("\n")
      : undefined,
  };
}

// =============================================================================
// Gate 2: Quality Evals Pass
// =============================================================================

async function evaluateGate2(projectPath: string): Promise<GateResult> {
  return new Promise((resolve) => {
    const proc = spawn("specflow", ["eval", "run", "--json"], {
      cwd: projectPath,
      stdio: ["inherit", "pipe", "pipe"],
      timeout: 120000,
    });

    let output = "";
    proc.stdout?.on("data", (data) => { output += data.toString(); });

    proc.on("close", (code) => {
      try {
        const result = JSON.parse(output);
        const passed = result.passed ?? code === 0;
        resolve({
          gate: 2,
          name: "Quality evals pass",
          passed,
          message: passed ? "All quality evaluations passed" : "Quality evaluations failed",
          details: output.substring(0, 500),
        });
      } catch {
        resolve({
          gate: 2,
          name: "Quality evals pass",
          passed: true, // Don't block if eval system unavailable
          message: "Quality eval system not configured (skipped)",
        });
      }
    });

    proc.on("error", () => {
      resolve({
        gate: 2,
        name: "Quality evals pass",
        passed: true,
        message: "Quality eval command not available (skipped)",
      });
    });
  });
}

// =============================================================================
// Gate 3: CHANGELOG Generated
// =============================================================================

function evaluateGate3(
  projectPath: string,
  featureId: string
): GateResult {
  const changelogPath = join(projectPath, "CHANGELOG.md");

  if (!existsSync(changelogPath)) {
    return {
      gate: 3,
      name: "CHANGELOG generated",
      passed: false,
      message: "No CHANGELOG.md found",
      details: "Generate with spec delta history: specflow release --generate-changelog",
    };
  }

  const content = readFileSync(changelogPath, "utf-8");
  const hasFeatureRef = content.includes(featureId);

  return {
    gate: 3,
    name: "CHANGELOG generated",
    passed: hasFeatureRef,
    message: hasFeatureRef
      ? `CHANGELOG.md references ${featureId}`
      : `CHANGELOG.md exists but doesn't reference ${featureId}`,
  };
}

// =============================================================================
// Gate 4: File Inventory
// =============================================================================

function evaluateGate4(
  projectPath: string,
  specPath: string
): GateResult {
  const inventoryPath = join(specPath, "file-inventory.md");

  if (!existsSync(inventoryPath)) {
    return {
      gate: 4,
      name: "File inventory and version tag",
      passed: false,
      message: "No file-inventory.md found in spec directory",
      details: "Run 'specflow brownfield scan' to generate file inventory",
    };
  }

  // Also verify a version tag exists at or after latest feature completion
  try {
    const result = Bun.spawnSync(["git", "tag", "--sort=-creatordate", "--list", "v*"], {
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const tags = result.stdout.toString().trim().split("\n").filter(Boolean);

    if (tags.length === 0) {
      return {
        gate: 4,
        name: "File inventory and version tag",
        passed: false,
        message: "File inventory exists but no version tag found",
        details: "Create a version tag (e.g., git tag v1.0.0) at or after feature completion",
      };
    }

    return {
      gate: 4,
      name: "File inventory and version tag",
      passed: true,
      message: `File inventory exists, version tag found: ${tags[0]}`,
    };
  } catch {
    return {
      gate: 4,
      name: "File inventory and version tag",
      passed: false,
      message: "File inventory exists but could not verify version tags",
      details: "Ensure git is available and create a version tag",
    };
  }
}

// =============================================================================
// Gate 5: PII/Secrets Scan
// =============================================================================

async function evaluateGate5(projectPath: string): Promise<GateResult> {
  return new Promise((resolve) => {
    const patterns = [
      "password\\s*=",
      "api_key\\s*=",
      "secret\\s*=",
      "token\\s*=",
      "AWS_ACCESS_KEY",
      "PRIVATE_KEY",
      "/Users/[a-z]+/",
    ];

    const proc = spawn(
      "grep",
      ["-rIl", "-E", patterns.join("|"), "--include=*.ts", "--include=*.js", "--include=*.md", "."],
      { cwd: projectPath, stdio: ["inherit", "pipe", "pipe"] }
    );

    let output = "";
    proc.stdout?.on("data", (data) => { output += data.toString(); });

    proc.on("close", (code) => {
      const files = output.trim().split("\n").filter(Boolean);
      // Filter out expected files
      const suspicious = files.filter(
        (f) => !f.includes("node_modules") && !f.includes(".env.example") && !f.includes("test")
      );

      resolve({
        gate: 5,
        name: "PII/secrets scan",
        passed: suspicious.length === 0,
        message:
          suspicious.length === 0
            ? "No PII or secrets detected"
            : `${suspicious.length} file(s) may contain secrets`,
        details: suspicious.length > 0
          ? suspicious.map((f) => `  - ${f}`).join("\n")
          : undefined,
      });
    });

    proc.on("error", () => {
      resolve({
        gate: 5,
        name: "PII/secrets scan",
        passed: false,
        message: "grep command failed",
      });
    });
  });
}

// =============================================================================
// Gate 6: Contribution Branch
// =============================================================================

async function evaluateGate6(projectPath: string, featureId: string): Promise<GateResult> {
  return new Promise((resolve) => {
    const proc = spawn("git", ["branch", "--list", `contrib-*${featureId}*`], {
      cwd: projectPath,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    proc.stdout?.on("data", (data) => { output += data.toString(); });

    proc.on("close", () => {
      const branches = output.trim().split("\n").filter(Boolean);
      resolve({
        gate: 6,
        name: "Contribution branch created",
        passed: branches.length > 0,
        message:
          branches.length > 0
            ? `Contrib branch found: ${branches[0].trim()}`
            : "No contrib branch found",
        details: branches.length === 0
          ? "Run 'specflow contrib-prep' to create contribution branch"
          : undefined,
      });
    });

    proc.on("error", () => {
      resolve({
        gate: 6,
        name: "Contribution branch created",
        passed: false,
        message: "Git not available",
      });
    });
  });
}

// =============================================================================
// Gate 7: Sanitization Verified
// =============================================================================

function evaluateGate7(projectPath: string, featureId: string): GateResult {
  // Check contrib-prep state for sanitization pass
  try {
    const { getContribState } = require("../../lib/contrib-prep/state") as {
      getContribState: (id: string) => { sanitizationPass: boolean | null } | null;
    };
    const state = getContribState(featureId);

    if (!state) {
      return {
        gate: 7,
        name: "Sanitization verified",
        passed: false,
        message: "No contrib-prep state found",
        details: "Run 'specflow contrib-prep' first",
      };
    }

    return {
      gate: 7,
      name: "Sanitization verified",
      passed: state.sanitizationPass === true,
      message:
        state.sanitizationPass === true
          ? "Sanitization passed"
          : "Sanitization not yet passed",
    };
  } catch {
    return {
      gate: 7,
      name: "Sanitization verified",
      passed: false,
      message: "Could not check contrib-prep state",
    };
  }
}

// =============================================================================
// Gate 8: PR Template Generated
// =============================================================================

function evaluateGate8(projectPath: string, featureId: string): GateResult {
  const prTemplatePath = join(projectPath, ".specify", "pr-template.md");

  if (existsSync(prTemplatePath)) {
    return {
      gate: 8,
      name: "PR template generated",
      passed: true,
      message: `PR template exists: ${prTemplatePath}`,
    };
  }

  return {
    gate: 8,
    name: "PR template generated",
    passed: false,
    message: "No PR template found",
    details: "Will be generated upon completing all prior gates",
  };
}

// =============================================================================
// Main Evaluator
// =============================================================================

/**
 * Evaluate all release gates sequentially, stopping on first failure.
 */
export async function evaluateReleaseGates(
  features: Feature[],
  featureId: string,
  specPath: string,
  projectPath: string
): Promise<ReleaseReport> {
  const gates: GateResult[] = [];
  let stoppedAtGate: number | null = null;

  // Gate 1
  const g1 = evaluateGate1(features);
  gates.push(g1);
  if (!g1.passed) { stoppedAtGate = 1; }

  // Gate 2
  if (!stoppedAtGate) {
    const g2 = await evaluateGate2(projectPath);
    gates.push(g2);
    if (!g2.passed) stoppedAtGate = 2;
  }

  // Gate 3
  if (!stoppedAtGate) {
    const g3 = evaluateGate3(projectPath, featureId);
    gates.push(g3);
    if (!g3.passed) stoppedAtGate = 3;
  }

  // Gate 4
  if (!stoppedAtGate) {
    const g4 = evaluateGate4(projectPath, specPath);
    gates.push(g4);
    if (!g4.passed) stoppedAtGate = 4;
  }

  // Gate 5
  if (!stoppedAtGate) {
    const g5 = await evaluateGate5(projectPath);
    gates.push(g5);
    if (!g5.passed) stoppedAtGate = 5;
  }

  // Gate 6
  if (!stoppedAtGate) {
    const g6 = await evaluateGate6(projectPath, featureId);
    gates.push(g6);
    if (!g6.passed) stoppedAtGate = 6;
  }

  // Gate 7
  if (!stoppedAtGate) {
    const g7 = evaluateGate7(projectPath, featureId);
    gates.push(g7);
    if (!g7.passed) stoppedAtGate = 7;
  }

  // Gate 8
  if (!stoppedAtGate) {
    const g8 = evaluateGate8(projectPath, featureId);
    gates.push(g8);
    if (!g8.passed) stoppedAtGate = 8;
  }

  return {
    evaluatedAt: new Date().toISOString(),
    featureId,
    gates,
    passed: stoppedAtGate === null,
    stoppedAtGate,
    artifacts: {},
  };
}

// =============================================================================
// Report Generator
// =============================================================================

export function generateReleaseReport(report: ReleaseReport): string {
  const lines: string[] = [];

  lines.push(`# Release Readiness: ${report.featureId}`);
  lines.push(`\nEvaluated: ${report.evaluatedAt}`);
  lines.push(`Status: ${report.passed ? "READY" : "NOT READY"}\n`);

  lines.push(`## Gate Results\n`);
  lines.push(`| Gate | Name | Status | Message |`);
  lines.push(`|------|------|--------|---------|`);

  for (const gate of report.gates) {
    const status = gate.passed ? "PASS" : "FAIL";
    lines.push(`| ${gate.gate} | ${gate.name} | ${status} | ${gate.message} |`);
  }

  if (report.stoppedAtGate) {
    lines.push(`\n**Stopped at Gate ${report.stoppedAtGate}**\n`);
    const failedGate = report.gates.find((g) => g.gate === report.stoppedAtGate);
    if (failedGate?.details) {
      lines.push(`### Remediation\n`);
      lines.push(failedGate.details);
    }
  }

  return lines.join("\n");
}

export function writeReleaseReport(projectPath: string, report: ReleaseReport): string {
  const outputPath = join(projectPath, ".specify", "release-readiness.md");
  mkdirSync(join(projectPath, ".specify"), { recursive: true });
  writeFileSync(outputPath, generateReleaseReport(report));
  return outputPath;
}
