/**
 * Runner Module
 * Orchestrates feature implementation with fresh context per feature
 */

import {
  initDatabase,
  closeDatabase,
  getNextFeature,
  getFeature,
  updateFeatureStatus,
  skipFeature,
  getStats,
  getDbPath,
} from "./database";
import { buildAppContext, buildFeatureContext, formatContextForAgent } from "./context";
import { executeFeature, executeFeatureStreaming } from "./executor";
import type { Feature, RunOptions, RunResult, FeatureStats } from "../types";
import {
  initProgressFile,
  updatePhaseStart,
  updatePhaseComplete,
  updatePipelineError,
  completePipeline,
} from "./progress-writer";
import { loadSpecflowConfig } from "./config";
import { getPhaseHooks } from "./config";
import { executeHooks, buildHookEnv } from "./hook-executor";
import { startPhaseExecution, completePhaseExecution, failPhaseExecution } from "./execution-log";
import { evaluateGate, waitForResolution } from "./gate-evaluator";
import { getDbInstance } from "./database";

// =============================================================================
// Runner Configuration
// =============================================================================

const DEFAULT_DELAY_SECONDS = 3;

// =============================================================================
// Runner Loop
// =============================================================================

export interface RunnerCallbacks {
  onFeatureStart?: (feature: Feature) => void;
  onFeatureComplete?: (feature: Feature, result: RunResult) => void;
  onFeatureBlocked?: (feature: Feature, reason: string) => void;
  onFeatureFailed?: (feature: Feature, error: string) => void;
  onOutput?: (chunk: string) => void;
  onProgress?: (stats: FeatureStats) => void;
}

/**
 * Run the implementation loop
 */
export async function runLoop(
  projectPath: string,
  options: RunOptions,
  callbacks: RunnerCallbacks = {}
): Promise<void> {
  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const appContext = buildAppContext(projectPath);

    let featuresCompleted = 0;
    const maxFeatures = options.maxFeatures || Infinity;

    while (featuresCompleted < maxFeatures) {
      // Get next pending feature
      const feature = getNextFeature();

      if (!feature) {
        // No more pending features
        const stats = getStats();
        callbacks.onProgress?.(stats);

        if (stats.complete === stats.total) {
          console.log("\n✓ All features complete!");
        } else {
          console.log("\n○ No pending features available.");
          console.log(`  ${stats.complete}/${stats.total} complete, ${stats.skipped} skipped`);
        }
        break;
      }

      // Check if feature has completed SpecFlow phases
      if (feature.phase !== "tasks" && feature.phase !== "implement") {
        console.log(`\n⚠ Feature ${feature.id} is not ready for implementation.`);
        console.log(`  Current phase: ${feature.phase || "none"}`);
        console.log(`  Required phase: tasks (after specify → plan → tasks)`);
        console.log(`\n  Run the following commands first:`);
        if (feature.phase === "none") {
          console.log(`    specflow specify ${feature.id}`);
          console.log(`    specflow plan ${feature.id}`);
          console.log(`    specflow tasks ${feature.id}`);
        } else if (feature.phase === "specify") {
          console.log(`    specflow plan ${feature.id}`);
          console.log(`    specflow tasks ${feature.id}`);
        } else if (feature.phase === "plan") {
          console.log(`    specflow tasks ${feature.id}`);
        }
        console.log("\nStopping runner. Complete SpecFlow phases before running.");
        break;
      }

      // Mark feature as in progress
      updateFeatureStatus(feature.id, "in_progress");
      callbacks.onFeatureStart?.(feature);

      // Initialize pipeline progress tracking
      initProgressFile(projectPath, feature.id, feature.name, ["implement"]);
      updatePhaseStart(projectPath, "implement");

      // Start execution log entry
      const db = getDbInstance();
      const logId = startPhaseExecution(db, feature.id, "implement", null);

      // Build context for this feature
      const featureContext = buildFeatureContext(appContext, feature);
      const prompt = formatContextForAgent(featureContext);

      // Execute
      let result: RunResult;

      if (options.dryRun) {
        console.log(`\n[DRY RUN] Would implement: ${feature.id} - ${feature.name}`);
        console.log(`Prompt length: ${prompt.length} characters`);

        // Reset status since we didn't actually run
        updateFeatureStatus(feature.id, "pending");
        featuresCompleted++;
        continue;
      }

      if (callbacks.onOutput) {
        // Streaming mode
        result = await executeFeatureStreaming(
          featureContext,
          prompt,
          callbacks.onOutput,
          { dryRun: options.dryRun }
        );
      } else {
        // Non-streaming mode
        result = await executeFeature(featureContext, prompt, {
          dryRun: options.dryRun,
        });
      }

      // Handle result
      if (result.success) {
        completePhaseExecution(db, logId, null, []);
        updateFeatureStatus(feature.id, "complete");
        updatePhaseComplete(projectPath, "implement", []);
        completePipeline(projectPath);
        callbacks.onFeatureComplete?.(feature, result);
        featuresCompleted++;

        const stats = getStats();
        callbacks.onProgress?.(stats);
      } else if (result.blocked) {
        failPhaseExecution(db, logId, result.blockReason ?? "Unknown reason");
        skipFeature(feature.id);
        updatePipelineError(projectPath, "implement", result.blockReason ?? "Unknown reason");
        callbacks.onFeatureBlocked?.(feature, result.blockReason ?? "Unknown reason");
      } else {
        // Failed - keep as in_progress for retry or manual intervention
        failPhaseExecution(db, logId, result.error ?? "Unknown error");
        callbacks.onFeatureFailed?.(feature, result.error ?? "Unknown error");
        updatePipelineError(projectPath, "implement", result.error ?? "Unknown error");

        // Don't auto-continue on failure - let user decide
        console.log("\nFeature failed. Stopping runner.");
        console.log("Use 'specflow reset' to retry or 'specflow skip' to move on.");
        break;
      }

      // Delay between features
      if (featuresCompleted < maxFeatures) {
        const delayMs = (options.delaySeconds || DEFAULT_DELAY_SECONDS) * 1000;
        await sleep(delayMs);
      }
    }
  } finally {
    closeDatabase();
  }
}

/**
 * Run a single feature by ID
 */
export async function runSingleFeature(
  projectPath: string,
  featureId: string,
  options: Omit<RunOptions, "maxFeatures">,
  callbacks: RunnerCallbacks = {}
): Promise<RunResult> {
  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const appContext = buildAppContext(projectPath);

    const feature = getFeature(featureId);
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Mark feature as in progress
    updateFeatureStatus(feature.id, "in_progress");
    callbacks.onFeatureStart?.(feature);

    // Initialize pipeline progress tracking
    initProgressFile(projectPath, feature.id, feature.name, ["implement"]);
    updatePhaseStart(projectPath, "implement");

    // Start execution log entry
    const db = getDbInstance();
    const logId = startPhaseExecution(db, feature.id, "implement", null);

    // Run pre-hooks for implement phase
    const config = loadSpecflowConfig(projectPath);
    const preHooks = getPhaseHooks(config, "implement", "pre");
    if (preHooks.length > 0) {
      const env = buildHookEnv(feature.id, "implement", projectPath);
      const hookResult = await executeHooks(preHooks, env, { position: "pre", cwd: projectPath });
      if (!hookResult.success) {
        const failedHook = hookResult.results[hookResult.abortedAtIndex ?? 0];
        const msg = `Pre-hook aborted implement phase: '${failedHook.command}' exited with code ${failedHook.exitCode}`;
        console.error(msg);
        updatePipelineError(projectPath, "implement", msg);
        callbacks.onFeatureBlocked?.(feature, msg);
        return {
          success: false,
          featureId: feature.id,
          output: failedHook.stderr || failedHook.stdout,
          error: msg,
          blocked: true,
          blockReason: msg,
        };
      }
    }

    // Build context
    const featureContext = buildFeatureContext(appContext, feature);
    const prompt = formatContextForAgent(featureContext);

    // Execute
    let result: RunResult;

    if (callbacks.onOutput) {
      result = await executeFeatureStreaming(
        featureContext,
        prompt,
        callbacks.onOutput,
        { dryRun: options.dryRun }
      );
    } else {
      result = await executeFeature(featureContext, prompt, {
        dryRun: options.dryRun,
      });
    }

    // Run post-hooks for implement phase
    const postHooks = getPhaseHooks(config, "implement", "post");
    if (postHooks.length > 0) {
      const phaseStatus = result.success ? "success" : result.blocked ? "blocked" : "failed";
      const postEnv = buildHookEnv(feature.id, "implement", projectPath, phaseStatus);
      await executeHooks(postHooks, postEnv, { position: "post", cwd: projectPath });
    }

    // Update status based on result
    if (result.success) {
      completePhaseExecution(db, logId, null, []);

      // Evaluate gate at implement->complete boundary
      const gateResult = evaluateGate(db, projectPath, feature.id, "implement_to_complete");
      if (gateResult && gateResult.action === "block") {
        console.log(`[GATE:CRITICAL] implement_to_complete for ${feature.id} — awaiting approval`);
        await waitForResolution(db, feature.id, "implement_to_complete", gateResult.timeoutMs, projectPath);
        console.log(`[GATE:RESOLVED] implement_to_complete for ${feature.id} — proceeding`);
      } else if (gateResult && gateResult.action === "notify_and_wait") {
        console.log(`[GATE:REVIEW] implement_to_complete for ${feature.id} — awaiting review`);
        await waitForResolution(db, feature.id, "implement_to_complete", gateResult.timeoutMs, projectPath);
        console.log(`[GATE:RESOLVED] implement_to_complete for ${feature.id} — proceeding`);
      }

      updateFeatureStatus(feature.id, "complete");
      updatePhaseComplete(projectPath, "implement", []);
      completePipeline(projectPath);
      callbacks.onFeatureComplete?.(feature, result);
    } else if (result.blocked) {
      failPhaseExecution(db, logId, result.blockReason ?? "Unknown");
      skipFeature(feature.id);
      updatePipelineError(projectPath, "implement", result.blockReason ?? "Unknown");
      callbacks.onFeatureBlocked?.(feature, result.blockReason ?? "Unknown");
    } else {
      failPhaseExecution(db, logId, result.error ?? "Unknown error");
      callbacks.onFeatureFailed?.(feature, result.error ?? "Unknown error");
      updatePipelineError(projectPath, "implement", result.error ?? "Unknown error");
    }

    return result;
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Hook Utilities (exported for use by other phase-executing commands)
// =============================================================================

/**
 * Run pre-hooks for a phase. Returns true if phase should proceed, false if aborted.
 */
export async function runPreHooks(
  projectPath: string,
  featureId: string,
  phase: string
): Promise<{ proceed: boolean; error?: string }> {
  const config = loadSpecflowConfig(projectPath);
  const hooks = getPhaseHooks(config, phase, "pre");
  if (hooks.length === 0) return { proceed: true };

  const env = buildHookEnv(featureId, phase, projectPath);
  const result = await executeHooks(hooks, env, { position: "pre", cwd: projectPath });

  if (!result.success) {
    const failed = result.results[result.abortedAtIndex ?? 0];
    return {
      proceed: false,
      error: `Pre-hook aborted ${phase} phase: '${failed.command}' exited with code ${failed.exitCode}`,
    };
  }

  return { proceed: true };
}

/**
 * Run post-hooks for a phase. Always succeeds (fire-and-forget).
 */
export async function runPostHooks(
  projectPath: string,
  featureId: string,
  phase: string,
  phaseStatus: string
): Promise<void> {
  const config = loadSpecflowConfig(projectPath);
  const hooks = getPhaseHooks(config, phase, "post");
  if (hooks.length === 0) return;

  const env = buildHookEnv(featureId, phase, projectPath, phaseStatus);
  await executeHooks(hooks, env, { position: "post", cwd: projectPath });
}

// =============================================================================
// Utilities
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
