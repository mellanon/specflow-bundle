/**
 * Autorun Module
 * Full-lifecycle self-orchestration loop
 *
 * Drives features through: specify -> plan -> tasks -> implement -> complete
 * Uses subprocess invocations of existing specflow commands.
 */

import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import type { Feature, AutorunOptions, AutorunSummary, PhaseResult } from "../types";
import { AUTORUN_PHASES } from "../types";
import {
  initProgressFile,
  updatePhaseStart,
  updatePhaseComplete,
  updatePipelineError,
  completePipeline,
} from "./progress-writer";

// Phase order for determining remaining phases
const PHASE_ORDER = ["none", "specify", "plan", "tasks", "implement", "harden", "review", "approve", "complete"] as const;

let shuttingDown = false;

/**
 * Get remaining phases for a feature based on its current phase
 */
function getRemainingPhases(currentPhase: string): string[] {
  const idx = PHASE_ORDER.indexOf(currentPhase as any);
  if (idx === -1) return [...AUTORUN_PHASES];
  // Remaining = everything after current phase, mapped to autorun phases
  return AUTORUN_PHASES.filter((_, i) => i >= idx && idx < PHASE_ORDER.length - 1)
    .filter((phase) => {
      const phaseIdx = PHASE_ORDER.indexOf(phase);
      return phaseIdx > idx;
    });
}

/**
 * Detect phase/artifact mismatch
 */
function detectMismatch(feature: Feature): string | null {
  const specPath = feature.specPath;
  if (!specPath) return null;

  const phaseArtifacts: Record<string, string> = {
    none: "spec.md",
    specify: "plan.md",
    plan: "tasks.md",
  };

  const artifact = phaseArtifacts[feature.phase];
  if (artifact && existsSync(join(specPath, artifact))) {
    return `Feature ${feature.id} at phase '${feature.phase}' but '${artifact}' already exists on disk`;
  }
  return null;
}

/**
 * Run a specflow subcommand for a phase
 */
async function runPhaseCommand(
  phase: string,
  feature: Feature,
  projectPath: string,
  dryRun: boolean
): Promise<PhaseResult> {
  if (dryRun) {
    return { success: true, skipped: false, blocked: false, error: null, artifacts: [] };
  }

  return new Promise((resolve) => {
    let args: string[] = [];

    switch (phase) {
      case "specify":
        // Use --batch if decomposition data available, --quick otherwise
        if (feature.problemType && feature.urgency && feature.primaryUser && feature.integrationScope) {
          args = ["specify", feature.id, "--batch"];
        } else {
          args = ["specify", feature.id, "--quick"];
        }
        break;
      case "plan":
        args = ["plan", feature.id];
        break;
      case "tasks":
        args = ["tasks", feature.id];
        break;
      case "implement":
        args = ["implement", "--feature", feature.id];
        break;
      case "harden":
        args = ["harden", feature.id];
        break;
      case "review":
        args = ["review", feature.id];
        break;
      case "approve":
        args = ["approve", feature.id];
        break;
      case "complete":
        args = ["complete", feature.id, "--force", "--skip-doctorow"];
        break;
      default:
        resolve({ success: false, skipped: false, blocked: false, error: `Unknown phase: ${phase}`, artifacts: [] });
        return;
    }

    console.log(`    Running: specflow ${args.join(" ")}`);

    const proc = spawn("specflow", args, {
      cwd: projectPath,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      process.stdout.write(chunk);
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    proc.on("close", (code) => {
      if (code === 0 || output.includes("[PHASE COMPLETE") || output.includes("[FEATURE COMPLETE")) {
        resolve({
          success: true,
          skipped: false,
          blocked: false,
          error: null,
          artifacts: [],
        });
      } else if (output.includes("[PHASE BLOCKED") || output.includes("[FEATURE BLOCKED")) {
        resolve({
          success: false,
          skipped: false,
          blocked: true,
          error: stderr || "Phase blocked",
          artifacts: [],
        });
      } else {
        resolve({
          success: false,
          skipped: false,
          blocked: false,
          error: stderr || `Phase exited with code ${code}`,
          artifacts: [],
        });
      }
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        skipped: false,
        blocked: false,
        error: `Process error: ${err.message}`,
        artifacts: [],
      });
    });
  });
}

/**
 * Format duration from milliseconds to human-readable
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

/**
 * Main autorun orchestration loop
 */
export async function runAutorun(
  projectPath: string,
  features: Feature[],
  options: AutorunOptions
): Promise<AutorunSummary> {
  const startedAt = new Date();
  let featuresProcessed = 0;
  let featuresSucceeded = 0;
  let featuresFailed = 0;
  let featuresBlocked = 0;
  let featuresSkipped = 0;

  // Setup graceful shutdown
  shuttingDown = false;
  const sigintHandler = () => {
    if (shuttingDown) {
      process.exit(130);
    }
    shuttingDown = true;
    console.log("\n\n  Shutting down gracefully...");
    console.log("  Waiting for current phase to complete.");
    console.log("  Press Ctrl+C again to force exit.\n");
  };
  process.on("SIGINT", sigintHandler);

  // Apply --start-from filter
  let featureList = [...features];
  if (options.startFrom) {
    const startIdx = featureList.findIndex((f) => f.id === options.startFrom);
    if (startIdx === -1) {
      console.error(`Error: Feature ${options.startFrom} not found.`);
      process.removeListener("SIGINT", sigintHandler);
      return {
        startedAt,
        completedAt: new Date(),
        featuresProcessed: 0,
        featuresSucceeded: 0,
        featuresFailed: 0,
        featuresBlocked: 0,
        featuresSkipped: 0,
      };
    }
    featureList = featureList.slice(startIdx);
  }

  // Apply --max-features limit
  if (options.maxFeatures > 0) {
    featureList = featureList.slice(0, options.maxFeatures);
  }

  // Filter to only pending/in_progress features
  featureList = featureList.filter((f) => f.status === "pending" || f.status === "in_progress");

  if (featureList.length === 0) {
    console.log("\n  No pending features to process.\n");
    process.removeListener("SIGINT", sigintHandler);
    return {
      startedAt,
      completedAt: new Date(),
      featuresProcessed: 0,
      featuresSucceeded: 0,
      featuresFailed: 0,
      featuresBlocked: 0,
      featuresSkipped: 0,
    };
  }

  // Dry run output
  if (options.dryRun) {
    console.log("\n" + "=".repeat(50));
    console.log("  AUTORUN DRY RUN");
    console.log("=".repeat(50) + "\n");

    for (const feature of featureList) {
      const remaining = getRemainingPhases(feature.phase);
      const specifyMode =
        feature.problemType && feature.urgency && feature.primaryUser && feature.integrationScope
          ? "batch"
          : "quick";
      console.log(`  ${feature.id} (priority ${feature.priority}) - ${feature.name}`);
      console.log(`    Current phase: ${feature.phase}`);
      console.log(`    Remaining: ${remaining.join(" -> ") || "none (already complete)"}`);
      if (remaining.includes("specify")) {
        console.log(`    Specify mode: ${specifyMode}`);
      }
      console.log("");
    }

    console.log("  " + "-".repeat(46));
    console.log(`  Total features: ${featureList.length}`);
    const totalPhases = featureList.reduce((sum, f) => sum + getRemainingPhases(f.phase).length, 0);
    console.log(`  Total phases to execute: ${totalPhases}`);
    console.log("");

    process.removeListener("SIGINT", sigintHandler);
    return {
      startedAt,
      completedAt: new Date(),
      featuresProcessed: featureList.length,
      featuresSucceeded: 0,
      featuresFailed: 0,
      featuresBlocked: 0,
      featuresSkipped: 0,
    };
  }

  console.log("\n" + "=".repeat(50));
  console.log("  AUTORUN STARTING");
  console.log("=".repeat(50));
  console.log(`  Features to process: ${featureList.length}\n`);

  for (const feature of featureList) {
    if (shuttingDown) {
      console.log("\n  Autorun interrupted. Exiting cleanly.\n");
      break;
    }

    const remaining = getRemainingPhases(feature.phase);

    if (remaining.length === 0) {
      console.log(`  ${feature.id}: Already complete, skipping.`);
      featuresSkipped++;
      featuresProcessed++;
      continue;
    }

    // Check for phase/artifact mismatch
    const mismatch = detectMismatch(feature);
    if (mismatch) {
      console.log(`\n  WARNING: ${mismatch}`);
      console.log(`  Skipping ${feature.id} - resolve mismatch manually.`);
      console.log(`  Use: specflow phase set ${feature.id} <correct-phase>`);
      featuresBlocked++;
      featuresProcessed++;
      if (!options.continueOnError) {
        console.log("\n  Stopping autorun due to mismatch. Use --continue-on-error to skip.");
        break;
      }
      continue;
    }

    console.log(`\n  ${"=".repeat(46)}`);
    console.log(`  ${feature.id} [P${feature.priority}] - ${feature.name}`);
    console.log(`  Phases: ${remaining.join(" -> ")}`);
    console.log(`  ${"=".repeat(46)}\n`);

    // Init progress file
    initProgressFile(projectPath, feature.id, feature.name, remaining);

    let featureSuccess = true;

    for (const phase of remaining) {
      if (shuttingDown) break;

      console.log(`\n  >> ${feature.id}: ${phase.toUpperCase()} phase`);

      updatePhaseStart(projectPath, phase);

      const result = await runPhaseCommand(phase, feature, projectPath, false);

      if (shuttingDown) break;

      if (result.success) {
        updatePhaseComplete(projectPath, phase, result.artifacts);
        console.log(`  << ${feature.id}: ${phase.toUpperCase()} complete`);
      } else if (result.blocked) {
        updatePipelineError(projectPath, phase, result.error || "Blocked");
        console.log(`  !! ${feature.id}: ${phase.toUpperCase()} BLOCKED - ${result.error}`);
        featuresBlocked++;
        featureSuccess = false;
        break;
      } else {
        updatePipelineError(projectPath, phase, result.error || "Failed");
        console.log(`  !! ${feature.id}: ${phase.toUpperCase()} FAILED - ${result.error}`);
        featuresFailed++;
        featureSuccess = false;

        if (!options.continueOnError) {
          console.log("\n  Stopping autorun. Use --continue-on-error to skip failed features.");
          process.removeListener("SIGINT", sigintHandler);

          return {
            startedAt,
            completedAt: new Date(),
            featuresProcessed: featuresProcessed + 1,
            featuresSucceeded,
            featuresFailed,
            featuresBlocked,
            featuresSkipped,
          };
        }
        break;
      }
    }

    featuresProcessed++;

    if (featureSuccess && !shuttingDown) {
      completePipeline(projectPath);
      featuresSucceeded++;
      console.log(`\n  ${feature.id}: COMPLETE`);
    }

    // Delay between features
    if (options.delaySeconds > 0 && featuresProcessed < featureList.length && !shuttingDown) {
      console.log(`\n  Waiting ${options.delaySeconds}s before next feature...`);
      await new Promise((resolve) => setTimeout(resolve, options.delaySeconds * 1000));
    }
  }

  process.removeListener("SIGINT", sigintHandler);

  const completedAt = new Date();
  const duration = completedAt.getTime() - startedAt.getTime();

  // Print summary
  console.log("\n" + "=".repeat(50));
  console.log("  AUTORUN COMPLETE");
  console.log("=".repeat(50));
  console.log(`  Features processed:  ${featuresProcessed}`);
  console.log(`  Succeeded:           ${featuresSucceeded}`);
  console.log(`  Failed:              ${featuresFailed}`);
  console.log(`  Blocked:             ${featuresBlocked}`);
  console.log(`  Skipped:             ${featuresSkipped}`);
  console.log("");
  console.log(`  Duration: ${formatDuration(duration)}`);
  console.log("=".repeat(50) + "\n");

  return {
    startedAt,
    completedAt,
    featuresProcessed,
    featuresSucceeded,
    featuresFailed,
    featuresBlocked,
    featuresSkipped,
  };
}
