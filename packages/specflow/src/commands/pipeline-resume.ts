/**
 * specflow pipeline resume <feature-id>
 * Resume a blocked pipeline from the last successful phase
 */

import { initDatabase, getDbPath, getDbInstance, dbExists } from "../lib/database";
import { readProgressFile } from "../lib/progress-reader";
import { updatePipelineResume, getLastSuccessfulPhase } from "../lib/progress-writer";
import { validatePhaseArtifacts } from "../lib/artifact-validator";
import { loadSpecflowConfig, getMaxResumeCount } from "../lib/config";
import { resolveFailureInDb, getUnresolvedFailures } from "../lib/failure-writer";
import type { SpecPhase, PhaseEvent } from "../types";
import { notify } from "../lib/notifications/dispatcher";

const PHASE_ORDER: SpecPhase[] = ["specify", "plan", "tasks", "implement", "harden", "review", "approve"];

export function pipelineResumeCommand(featureId: string): void {
  const projectPath = process.cwd();
  const dbPath = getDbPath(projectPath);

  if (!dbExists(projectPath)) {
    console.error("No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  initDatabase(dbPath);
  const db = getDbInstance();

  // Read progress file
  const progress = readProgressFile(projectPath);
  if (!progress || progress.feature_id !== featureId) {
    console.error(`No progress file found for ${featureId}`);
    process.exit(1);
  }

  if (progress.status === "running") {
    console.error(`Pipeline for ${featureId} is already running. Cannot resume.`);
    process.exit(1);
  }

  if (progress.status !== "blocked") {
    console.error(`Pipeline for ${featureId} is not blocked (status: ${progress.status}). Nothing to resume.`);
    process.exit(1);
  }

  // Determine the blocked phase
  const lastSuccessful = getLastSuccessfulPhase(projectPath);
  const blockedPhaseIndex = lastSuccessful
    ? PHASE_ORDER.indexOf(lastSuccessful as SpecPhase) + 1
    : 0;

  if (blockedPhaseIndex >= PHASE_ORDER.length) {
    console.error(`No phase to resume for ${featureId}`);
    process.exit(1);
  }

  const blockedPhase = PHASE_ORDER[blockedPhaseIndex];
  const config = loadSpecflowConfig(projectPath);

  // Re-validate artifacts for the blocked phase
  const validation = validatePhaseArtifacts(projectPath, featureId, blockedPhase, config);
  if (!validation.valid) {
    console.error(`Cannot resume ${featureId} — still missing required artifacts for ${blockedPhase}:`);
    for (const file of validation.missing_required) {
      console.error(`  - ${file}`);
    }
    process.exit(1);
  }

  // Check resume count
  const failures = getUnresolvedFailures(db);
  const featureFailure = failures.find((f) => f.feature_id === featureId);
  const resumeCount = (featureFailure?.resume_count || 0) + 1;
  const maxResumes = getMaxResumeCount(config);

  if (resumeCount > maxResumes) {
    console.warn(`\nWARNING: ${featureId} has been resumed ${resumeCount} times (max: ${maxResumes}).`);
    console.warn(`This indicates a recurring failure pattern.\n`);

    const event: PhaseEvent = {
      phase: blockedPhase,
      transition: "fail",
      featureId,
      featureName: progress.feature_name,
      timestamp: new Date().toISOString(),
      pipelineContext: `Circuit breaker: resume count ${resumeCount} exceeds max ${maxResumes}`,
    };
    notify(event, projectPath).catch(() => {});
  }

  // Resolve the failure and resume
  resolveFailureInDb(db, featureId);
  updatePipelineResume(projectPath, blockedPhase);

  // Update feature status back to in_progress
  db.run(`UPDATE features SET status = 'in_progress' WHERE id = ?`, [featureId]);

  console.log(`[PIPELINE RESUMED] ${featureId} from phase: ${blockedPhase}`);
  console.log(`  Last successful phase: ${lastSuccessful || "none"}`);
  console.log(`  Resume count: ${resumeCount}`);
}
