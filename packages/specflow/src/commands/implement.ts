/**
 * Implement Command
 * Generate implementation prompt ONLY if all phases are complete
 *
 * This is the gatekeeper that ensures the SpecFlow workflow is followed.
 * Unlike 'next', this command REFUSES to generate a prompt if:
 * - spec.md doesn't exist
 * - plan.md doesn't exist
 * - tasks.md doesn't exist
 *
 * This prevents LLMs from skipping directly to implementation.
 */

import { join } from "path";
import { readFileSync, existsSync } from "fs";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getNextReadyFeature,
  getNextFeatureNeedingPhases,
  updateFeatureStatus,
  updateFeaturePhase,
  getDbPath,
  dbExists,
} from "../lib/database";
import { runClaude } from "../lib/claude";
import { parseCompletionMarkers, extractAndSaveTestResults } from "../lib/executor";
import type { Feature } from "../types";

export interface ImplementCommandOptions {
  json?: boolean;
  featureId?: string;
  noBranch?: boolean;
}

interface ImplementPrompt {
  featureId: string;
  name: string;
  description: string;
  prompt: string;
  files: {
    spec: string;
    plan: string;
    tasks: string;
  };
}

/**
 * Build implementation prompt from spec files
 */
function buildImplementationPrompt(feature: Feature, noBranch: boolean = false): ImplementPrompt {
  const specPath = feature.specPath!;
  const specFile = join(specPath, "spec.md");
  const planFile = join(specPath, "plan.md");
  const tasksFile = join(specPath, "tasks.md");

  const spec = readFileSync(specFile, "utf-8");
  const plan = readFileSync(planFile, "utf-8");
  const tasks = readFileSync(tasksFile, "utf-8");

  // Build the implementation prompt
  // Create branch name from feature id and name (e.g., "feat/F-1-rss-discovery")
  const branchName = `feat/${feature.id}-${feature.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const branchSection = noBranch ? "" : `
## FIRST: Create Feature Branch

**Before writing any code, create and switch to a feature branch:**

\`\`\`bash
git checkout -b ${branchName}
\`\`\`

This ensures:
- Main branch stays clean and deployable
- Work can be reviewed via pull request
- Easy rollback if issues arise
`;

  const prompt = `# Feature Implementation

## Context & Motivation

This implementation prompt is only generated after completing all SpecFlow phases—specification, technical planning, and task breakdown. By the time you reach this phase, requirements are documented, architecture is decided, and tasks are explicit. This upstream work reduces implementation time by 40-50% and prevents the "build first, understand later" anti-pattern that causes rework.
${branchSection}
## Feature

**ID:** ${feature.id}
**Name:** ${feature.name}
**Description:** ${feature.description}

## Specification (spec.md)

${spec}

## Technical Plan (plan.md)

${plan}

## Implementation Tasks (tasks.md)

${tasks}

## Instructions

### Implementation Workflow

Work through tasks in the order specified in tasks.md. For each task:

1. **Read the task** - Understand what needs to be built and where
2. **Write failing test** - Define expected behavior before writing code
3. **Confirm failure** - Run \`specflow tdd\` to verify it fails (tracks iteration)
4. **Write minimal implementation** - Just enough code to pass the test
5. **Confirm pass** - Run \`specflow tdd\` to verify implementation works
6. **Refactor if needed** - Clean up while keeping tests green
7. **Mark task complete** - Update progress tracking table

### TDD Tracking (IMPORTANT)

**Always use \`specflow tdd\` instead of \`bun test\` for running tests.**

This command:
- Tracks each test run with iteration numbers (Run #1, #2, #3...)
- Shows which tests were fixed or broke since last run
- Assigns stable IDs to each test (UT-1, UT-2...) for traceability
- Saves history to \`.specify/tests/history/\` for debugging regressions

\`\`\`bash
# Run tests with tracking
specflow tdd

# Check TDD progress
specflow tdd --status

# See iteration history
specflow test-track --history
\`\`\`

The output shows deltas: \`✓ PASS | Run #5 | 45/45 (100%) (+3 pass, 2 fixed)\`

### Quality Standards

| Standard | Requirement |
|----------|-------------|
| Type safety | TypeScript strict mode, explicit types |
| Documentation | JSDoc for exported functions |
| Error handling | Specific error types, actionable messages |
| Code style | Match existing project conventions |

### Example TDD Cycle

\`\`\`typescript
// Task: T-1.1 Create data model
// Step 1: Write failing test
describe('DataModel', () => {
  it('validates required fields', () => {
    expect(() => createEntity({})).toThrow('name is required');
  });
});

// Step 2: Run specflow tdd → FAIL (function doesn't exist yet)
//   Output: ✗ UT-42 should throw 'name is required'
//   Run #1 | 44/45 (97.8%) | 1 new failure

// Step 3: Write minimal implementation
export function createEntity(data: unknown): Entity {
  const parsed = EntitySchema.parse(data);
  return parsed;
}

// Step 4: Run specflow tdd → PASS
//   Output: ✓ ALL PASS | Run #2 | 45/45 (100%) (+1 pass, UT-42 fixed)

// Step 5: Refactor (add edge cases, improve error messages)
// Step 6: Run specflow tdd → verify no regressions
// Step 7: Mark T-1.1 complete, move to T-1.2
\`\`\`

## Output Format

### On Success

\`\`\`
[FEATURE COMPLETE]
Feature: ${feature.id} - ${feature.name}
Tests: [number] passing
Files: [list of created/modified files]
\`\`\`

### On Blocker

\`\`\`
[FEATURE BLOCKED]
Feature: ${feature.id} - ${feature.name}
Reason: [why implementation cannot proceed]
Suggestion: [how to resolve]
\`\`\`

### On Partial Completion

\`\`\`
[FEATURE PARTIAL]
Feature: ${feature.id} - ${feature.name}
Completed: [list of completed task IDs]
Remaining: [list of remaining task IDs]
Blocker: [what's preventing completion]
\`\`\`
`;

  return {
    featureId: feature.id,
    name: feature.name,
    description: feature.description,
    prompt,
    files: { spec, plan, tasks },
  };
}

/**
 * Main implement command
 *
 * CRITICAL: This command validates that all phases are complete
 * before allowing implementation to proceed.
 */
export async function implementCommand(
  options: ImplementCommandOptions = {}
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  const dbPath = getDbPath(projectPath);

  try {
    initDatabase(dbPath);

    // Get the feature to implement
    let feature: Feature | null;

    if (options.featureId) {
      feature = getFeature(options.featureId);
      if (!feature) {
        console.error(`Error: Feature ${options.featureId} not found.`);
        process.exit(1);
      }
    } else {
      // Get highest-priority feature that's ready for implementation
      feature = getNextReadyFeature();

      if (!feature) {
        // Check if there are features that need phases first
        const needsPhases = getNextFeatureNeedingPhases();

        if (needsPhases) {
          console.error("═".repeat(60));
          console.error("NO FEATURES READY - SpecFlow phases needed first");
          console.error("═".repeat(60));
          console.error("");
          console.error(`Next feature by priority: ${needsPhases.id} - ${needsPhases.name}`);
          console.error(`Priority: ${needsPhases.priority}`);
          console.error(`Current phase: ${needsPhases.phase || "none"}`);
          console.error("");
          console.error("Complete SpecFlow phases first:");
          if (needsPhases.phase === "none") {
            console.error(`  specflow specify ${needsPhases.id}`);
          }
          if (needsPhases.phase === "none" || needsPhases.phase === "specify") {
            console.error(`  specflow plan ${needsPhases.id}`);
          }
          if (needsPhases.phase !== "tasks" && needsPhases.phase !== "implement") {
            console.error(`  specflow tasks ${needsPhases.id}`);
          }
          console.error("");
          console.error("Then run: specflow implement");
          process.exit(1);
        }

        console.log("No pending features. All features are complete or skipped.");
        return;
      }
    }

    // Check if already complete
    if (feature.status === "complete") {
      console.error(`Error: Feature ${feature.id} is already complete.`);
      process.exit(1);
    }

    // Validate spec path exists
    if (!feature.specPath) {
      console.error(`Error: Feature ${feature.id} has no spec path.`);
      console.error("");
      console.error("You must complete the SpecFlow workflow first:");
      console.error(`  1. Run 'specflow specify ${feature.id}' to create specification`);
      console.error(`  2. Run 'specflow plan ${feature.id}' to create technical plan`);
      console.error(`  3. Run 'specflow tasks ${feature.id}' to create implementation tasks`);
      console.error(`  4. Run 'specflow implement --feature ${feature.id}' to get implementation prompt`);
      process.exit(1);
    }

    // Validate pre-implementation files (spec, plan, tasks only)
    // NOTE: docs.md, verify.md, test coverage are post-implementation
    // checks that belong in 'specflow complete', not here.
    const specFile = join(feature.specPath, "spec.md");
    const planFile = join(feature.specPath, "plan.md");
    const tasksFile = join(feature.specPath, "tasks.md");

    const specExists = existsSync(specFile);
    const planExists = existsSync(planFile);
    const tasksExists = existsSync(tasksFile);

    if (!specExists || !planExists || !tasksExists) {
      console.error("═".repeat(60));
      console.error("IMPLEMENTATION BLOCKED - SpecFlow phases incomplete");
      console.error("═".repeat(60));
      console.error("");
      console.error(`Feature: ${feature.id} - ${feature.name}`);
      console.error("");
      console.error("File status:");
      console.error(`  spec.md:  ${specExists ? "✓ exists" : "✗ missing"}`);
      console.error(`  plan.md:  ${planExists ? "✓ exists" : "✗ missing"}`);
      console.error(`  tasks.md: ${tasksExists ? "✓ exists" : "✗ missing"}`);
      console.error("");

      if (!specExists) {
        console.error(`Next: Run 'specflow specify ${feature.id}'`);
      } else if (!planExists) {
        console.error(`Next: Run 'specflow plan ${feature.id}'`);
      } else {
        console.error(`Next: Run 'specflow tasks ${feature.id}'`);
      }

      process.exit(1);
    }

    // All validation passed - generate the prompt
    console.error("✓ Validation passed - all SpecFlow phases complete");
    console.error("");

    // Mark as in_progress and update phase
    updateFeatureStatus(feature.id, "in_progress");
    updateFeaturePhase(feature.id, "implement");

    const implResult = buildImplementationPrompt(feature, options.noBranch ?? false);

    if (options.json) {
      // JSON mode: output prompt for external consumption
      console.log(JSON.stringify(implResult, null, 2));
    } else {
      // Execute mode: run Claude with the implementation prompt
      console.log(`\n📝 Implementing ${feature.id} - ${feature.name}\n`);
      console.log("─".repeat(60));
      console.log("Invoking Claude with SpecFlow implement workflow...\n");

      const claudeResult = await runClaude(implResult.prompt, {
        cwd: projectPath,
        timeout: 3_600_000, // 60 minutes — implementation includes TDD cycles
      });

      const output = claudeResult.output ?? "";

      // Track test results for TDD traceability
      const testResults = extractAndSaveTestResults(output, projectPath, feature.id);
      if (testResults.saved) {
        console.error(`\n[TDD Track] Saved: ${testResults.pass} pass, ${testResults.fail} fail`);
      }

      // Parse completion markers
      const completion = parseCompletionMarkers(output);

      console.log("\n" + "─".repeat(60));

      if (completion.complete) {
        updateFeaturePhase(feature.id, "harden");
        console.log(`\n✓ ${feature.id} IMPLEMENT phase complete → harden`);
        if (completion.testsCount) {
          console.log(`  Tests: ${completion.testsCount} passing`);
        }
        if (completion.files.length > 0) {
          console.log(`  Files: ${completion.files.join(", ")}`);
        }
        console.log(`  Next: specflow harden ${feature.id}`);
      } else if (claudeResult.success) {
        // Claude exited 0 but no marker — still advance, implementation ran
        updateFeaturePhase(feature.id, "harden");
        console.log(`\n~ ${feature.id} IMPLEMENT phase finished → harden (no completion marker)`);
        console.log(`  Next: specflow harden ${feature.id}`);
      } else if (completion.blocked) {
        console.error(`\n✗ ${feature.id} IMPLEMENT phase blocked: ${completion.blockReason}`);
        updateFeatureStatus(feature.id, "pending");
        process.exitCode = 1;
      } else {
        console.error(`\n✗ ${feature.id} IMPLEMENT phase failed: ${claudeResult.error}`);
        updateFeatureStatus(feature.id, "pending");
        process.exitCode = 1;
      }
    }
  } finally {
    closeDatabase();
  }
}
