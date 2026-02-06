/**
 * Audit Check: Phase Artifact Integrity (FR-4)
 *
 * For each feature, verify artifacts exist for the claimed phase:
 *   - specify: spec.md
 *   - plan: plan.md
 *   - tasks: tasks.md
 *   - complete/implement: spec.md minimum
 *   - harden dir exists: check acceptance-test.md AND results.json
 *   - review dir exists: check review-package.md
 *   - evolving: check baselines/{featureId}/manifest.json
 */

import { existsSync } from "fs";
import { join } from "path";
import type { Feature } from "../../types";
import type { AuditFinding } from "./types";

/**
 * Phase to required artifact mapping.
 * "cumulative" means all phases up to and including the current one must have their artifacts.
 */
const PHASE_ARTIFACTS: Record<string, { required: string[]; description: string }> = {
  specify: {
    required: ["spec.md"],
    description: "spec.md",
  },
  plan: {
    required: ["spec.md", "plan.md"],
    description: "plan.md",
  },
  tasks: {
    required: ["spec.md", "plan.md", "tasks.md"],
    description: "tasks.md",
  },
  implement: {
    required: ["spec.md"],
    description: "spec.md (minimum for implement)",
  },
};

export function checkPhaseArtifacts(
  features: Feature[],
  projectPath: string
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const feature of features) {
    // Skip features with no phase or none phase
    if (feature.phase === "none") continue;
    // Skip skipped features
    if (feature.status === "skipped") continue;

    const specDir = feature.specPath;
    if (!specDir) {
      // Feature has a phase but no specPath -- that's a problem
      findings.push({
        severity: "critical",
        check: "phase-artifacts",
        featureId: feature.id,
        message: `Phase=${feature.phase} but no spec path configured`,
        suggestedFix: `specflow specify ${feature.id}`,
      });
      continue;
    }

    // Check spec directory phase artifacts
    const phaseConfig = PHASE_ARTIFACTS[feature.phase];
    if (phaseConfig) {
      for (const artifact of phaseConfig.required) {
        const artifactPath = join(specDir, artifact);
        if (!existsSync(artifactPath)) {
          findings.push({
            severity: "critical",
            check: "phase-artifacts",
            featureId: feature.id,
            message: `Phase=${feature.phase} but ${artifact} missing`,
            suggestedFix: getSuggestedFix(feature.id, artifact),
          });
        }
      }
    }

    // Check harden artifacts if harden directory exists
    const hardenDir = join(projectPath, ".specify", "harden", feature.id.toLowerCase());
    if (existsSync(hardenDir)) {
      const atPath = join(hardenDir, "acceptance-test.md");
      const resultsPath = join(hardenDir, "results.json");

      if (!existsSync(atPath)) {
        findings.push({
          severity: "warning",
          check: "phase-artifacts",
          featureId: feature.id,
          message: "Harden directory exists but acceptance-test.md missing",
          suggestedFix: `specflow harden ${feature.id}`,
        });
      }

      if (!existsSync(resultsPath) && existsSync(atPath)) {
        findings.push({
          severity: "warning",
          check: "phase-artifacts",
          featureId: feature.id,
          message: "Harden directory exists but results.json missing",
          suggestedFix: `specflow harden ${feature.id} --ingest`,
        });
      }
    }

    // Check review artifacts if review directory exists
    const reviewDir = join(projectPath, ".specify", "review", feature.id.toLowerCase());
    if (existsSync(reviewDir)) {
      const reviewPackagePath = join(reviewDir, "review-package.md");
      if (!existsSync(reviewPackagePath)) {
        findings.push({
          severity: "warning",
          check: "phase-artifacts",
          featureId: feature.id,
          message: "Review directory exists but review-package.md missing",
          suggestedFix: `specflow review ${feature.id}`,
        });
      }
    }

    // Check evolving artifacts
    if (feature.status === "evolving") {
      const baselineDir = join(projectPath, ".specify", "baselines", feature.id.toLowerCase());
      const manifestPath = join(baselineDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        findings.push({
          severity: "critical",
          check: "phase-artifacts",
          featureId: feature.id,
          message: "Status=evolving but baselines manifest.json missing",
          suggestedFix: `specflow evolve ${feature.id}`,
        });
      }
    }
  }

  return findings;
}

function getSuggestedFix(featureId: string, artifact: string): string {
  switch (artifact) {
    case "spec.md":
      return `specflow specify ${featureId}`;
    case "plan.md":
      return `specflow plan ${featureId}`;
    case "tasks.md":
      return `specflow tasks ${featureId}`;
    default:
      return `# Create missing ${artifact} for ${featureId}`;
  }
}
