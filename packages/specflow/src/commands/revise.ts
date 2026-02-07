/**
 * Revise Command
 * Revise a spec/plan/tasks artifact based on feedback
 *
 * Council Design Decision (F-093):
 * - Support targeted revision of specific artifacts
 * - Preserve core content while improving weak sections
 * - Track revision history for audit trail
 */

import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { createInterface } from "readline";
import { runClaude } from "../lib/claude";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
} from "../lib/database";
import {
  ArtifactType,
  ARTIFACT_FILES,
  ARTIFACT_DESCRIPTIONS,
  readArtifact,
  writeArtifact,
  createRevisionEntry,
  buildRevisionPrompt,
  buildRevisionSummary,
  getRevisionHistory,
  formatRevisionHistory,
} from "../lib/revision";
import {
  createSpecVersion,
  createSpecDelta,
  getLatestSpecVersion,
  hashContent,
  computeSectionDiffs,
} from "../lib/spec-versions";

export interface ReviseCommandOptions {
  /** Revise the spec.md artifact */
  spec?: boolean;
  /** Revise the plan.md artifact */
  plan?: boolean;
  /** Revise the tasks.md artifact */
  tasks?: boolean;
  /** Custom feedback to incorporate */
  feedback?: string;
  /** Dry run mode - show what would happen */
  dryRun?: boolean;
  /** Show revision history */
  history?: boolean;
}

/**
 * Prompt user to select artifact type
 */
async function promptForArtifactType(specPath: string): Promise<ArtifactType | null> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Show available artifacts
  console.log("\nAvailable artifacts:");
  const available: ArtifactType[] = [];

  for (const type of ["spec", "plan", "tasks"] as ArtifactType[]) {
    const exists = existsSync(join(specPath, ARTIFACT_FILES[type]));
    const status = exists ? "✓" : "✗";
    console.log(`  ${status} ${type} - ${ARTIFACT_DESCRIPTIONS[type]}`);
    if (exists) {
      available.push(type);
    }
  }

  if (available.length === 0) {
    console.log("\nNo artifacts available to revise.");
    rl.close();
    return null;
  }

  return new Promise((resolve) => {
    rl.question("\nWhich artifact to revise? [spec/plan/tasks] ", (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase() as ArtifactType;

      if (available.includes(normalized)) {
        resolve(normalized);
      } else {
        console.log(`Invalid selection: ${answer}`);
        resolve(null);
      }
    });
  });
}

/**
 * Prompt user for feedback if not provided
 */
async function promptForFeedback(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\nProvide feedback for the revision (press Enter twice to finish):");
    let feedback = "";
    let emptyLineCount = 0;

    rl.on("line", (line) => {
      if (line === "") {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          rl.close();
          resolve(feedback.trim());
          return;
        }
      } else {
        emptyLineCount = 0;
      }
      feedback += line + "\n";
    });
  });
}

// runClaudeRevision replaced by shared runClaude from ../lib/claude

/**
 * Determine artifact type from options
 */
function getArtifactTypeFromOptions(options: ReviseCommandOptions): ArtifactType | null {
  if (options.spec) return "spec";
  if (options.plan) return "plan";
  if (options.tasks) return "tasks";
  return null;
}

/**
 * Execute the revise command
 */
export async function reviseCommand(
  featureId: string,
  options: ReviseCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found in current directory.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);
    const feature = getFeature(featureId);

    if (!feature) {
      console.error(`Error: Feature ${featureId} not found.`);
      process.exit(1);
    }

    if (!feature.specPath) {
      console.error(`Error: Feature ${featureId} has no spec path.`);
      console.error(`Run 'specflow specify ${featureId}' first.`);
      process.exit(1);
    }

    // Handle --history flag
    if (options.history) {
      console.log(`\n📜 Revision History for ${featureId}`);
      console.log("─".repeat(50));

      for (const type of ["spec", "plan", "tasks"] as ArtifactType[]) {
        const artifactPath = join(feature.specPath, ARTIFACT_FILES[type]);
        const history = getRevisionHistory(artifactPath);
        if (history.length > 0) {
          console.log(`\n${type}.md:`);
          console.log(formatRevisionHistory(history));
        }
      }

      const allEmpty = ["spec", "plan", "tasks"].every(type => {
        const artifactPath = join(feature.specPath!, ARTIFACT_FILES[type as ArtifactType]);
        return getRevisionHistory(artifactPath).length === 0;
      });

      if (allEmpty) {
        console.log("\nNo revision history found for this feature.");
      }

      return;
    }

    // Determine which artifact to revise
    let artifactType = getArtifactTypeFromOptions(options);

    if (!artifactType) {
      artifactType = await promptForArtifactType(feature.specPath);
      if (!artifactType) {
        process.exit(1);
      }
    }

    // Check artifact exists
    const content = readArtifact(feature.specPath, artifactType);
    if (!content) {
      console.error(`Error: ${ARTIFACT_FILES[artifactType]} not found.`);
      console.error(`Run the appropriate SpecFlow phase first.`);
      process.exit(1);
    }

    console.log(`\n✏️  Revising ${artifactType}.md for ${featureId}`);
    console.log("─".repeat(50));

    // Get feedback
    let feedback = options.feedback;
    if (!feedback) {
      feedback = await promptForFeedback();
    }

    if (!feedback || feedback.trim() === "") {
      console.log("No feedback provided. Aborting revision.");
      return;
    }

    // Dry run mode
    if (options.dryRun) {
      console.log("\n[DRY RUN] Would revise with the following feedback:");
      console.log(feedback);
      console.log("\n[DRY RUN] Prompt that would be used:");
      console.log(buildRevisionPrompt(content, feedback, artifactType));
      return;
    }

    // Create revision entry (saves current content)
    const revisionEntry = createRevisionEntry(
      feature.specPath,
      artifactType,
      options.feedback ? "user_request" : "user_request",
      feedback
    );

    if (!revisionEntry) {
      console.error("Error: Failed to create revision entry.");
      process.exit(1);
    }

    console.log(`\n📝 Saved current content (revision: ${revisionEntry.id.slice(0, 8)})`);

    // Build and run the revision prompt
    const prompt = buildRevisionPrompt(content, feedback, artifactType);

    console.log("\nInvoking Claude for revision...\n");
    console.log("─".repeat(60));

    const result = await runClaude(prompt, { cwd: projectPath });

    if (result.success && result.output.trim()) {
      const revisedContent = result.output.trim();

      // Write the revised content
      writeArtifact(feature.specPath, artifactType, revisedContent);

      // Create spec version and deltas for spec artifact revisions
      if (artifactType === "spec") {
        const previousVersion = getLatestSpecVersion(featureId);
        const newVersion = createSpecVersion(featureId, hashContent(revisedContent));
        console.log(`\n📸 Spec version ${newVersion.version} snapshot created`);

        // Compute and store section-level deltas
        if (previousVersion) {
          const diffs = computeSectionDiffs(content, revisedContent);
          for (const diff of diffs) {
            createSpecDelta({
              featureId,
              fromVersion: previousVersion.version,
              toVersion: newVersion.version,
              changeType: diff.changeType,
              sectionPath: diff.sectionPath,
              diffContent: diff.diffContent,
            });
          }
          if (diffs.length > 0) {
            console.log(`📊 ${diffs.length} delta(s) recorded between v${previousVersion.version} → v${newVersion.version}`);
          }
        }
      }

      console.log("\n─".repeat(60));
      console.log(`\n✓ Revised ${artifactType}.md`);
      console.log(buildRevisionSummary(content, revisedContent, artifactType));
      console.log(`\nTo restore previous version: Use revision ID ${revisionEntry.id.slice(0, 8)}`);
      console.log(`\nNext: Run 'specflow eval run --file ${join(feature.specPath, ARTIFACT_FILES[artifactType])}' to evaluate`);
    } else {
      console.error(`\n✗ Revision failed: ${result.error || "No output generated"}`);
      process.exit(1);
    }
  } finally {
    closeDatabase();
  }
}
