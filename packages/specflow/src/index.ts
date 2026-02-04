#!/usr/bin/env bun
/**
 * SpecFlow CLI
 * Multi-agent orchestration for spec-driven development
 */

import { Command } from "commander";
import { version } from "../package.json";
import { statusCommand } from "./commands/status";
import { skipCommand } from "./commands/skip";
import { resetCommand } from "./commands/reset";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";
import { nextCommand } from "./commands/next";
import { completeCommand } from "./commands/complete";
import { validateCommand } from "./commands/validate";
import { implementCommand } from "./commands/implement";
import { specifyCommand } from "./commands/specify";
import { planCommand } from "./commands/plan";
import { tasksCommand } from "./commands/tasks";
import { uiCommand } from "./commands/ui";
import { phaseCommand } from "./commands/phase";
import { addCommand } from "./commands/add";
import { removeCommand } from "./commands/remove";
import { editCommand } from "./commands/edit";
import { evalCommand } from "./commands/eval";
import { migrateRegistryCommand } from "./commands/migrate-registry";
import { migrateCommand } from "./commands/migrate";
import { reviseCommand } from "./commands/revise";
import { specifyAllCommand } from "./commands/specify-all";
import { enrichCommand } from "./commands/enrich";
import { contribPrepCommand } from "./commands/contrib-prep";
import { brownfieldCommand } from "./commands/brownfield";
import { reviewCommand } from "./commands/review";
import { releaseCommand } from "./commands/release";
import { approveCommand } from "./commands/approve";
import { rejectCommand } from "./commands/reject";
import { pendingCommand } from "./commands/pending";
import { pipelineResumeCommand } from "./commands/pipeline-resume";
import { logCommand } from "./commands/log";
import { rollbackCommand } from "./commands/rollback";
import { autorunCommand } from "./commands/autorun";
import { versionCommand } from "./commands/version";
import { evolveCommand } from "./commands/evolve";
import { requestChangesCommand } from "./commands/request-changes";
import { hardenCommand } from "./commands/harden";
import { testTrackCommand } from "./commands/test-track";
import { tddCommand } from "./commands/tdd";

// =============================================================================
// Main Program
// =============================================================================

const program = new Command()
  .name("specflow")
  .description("Multi-agent orchestration for spec-driven development")
  .version(version);

// =============================================================================
// Commands
// =============================================================================

program
  .command("init")
  .description("Initialize a new application with feature decomposition")
  .argument("[description]", "High-level description of the application")
  .option("--min-features <n>", "Minimum features to generate", "5")
  .option("--max-features <n>", "Maximum features to generate", "20")
  .option("--from-features <file>", "Load features from JSON file")
  .option("--from-spec <file>", "Decompose features from spec file")
  .option("--force", "Overwrite existing database")
  .action(initCommand);

program
  .command("add")
  .description("Add a new feature to the queue")
  .argument("<name>", "Feature name")
  .argument("<description>", "Feature description")
  .option("--priority <n>", "Priority (default: 999)")
  .action(addCommand);

program
  .command("remove")
  .description("Remove a feature from the queue")
  .argument("<feature-id>", "Feature ID to remove (e.g., F-001)")
  .option("--force", "Force removal of completed features or those with spec files")
  .action((featureId, options) => removeCommand(featureId, { force: options.force }));

program
  .command("edit")
  .description("Edit feature properties (priority, name, description)")
  .argument("<feature-id>", "Feature ID to edit (e.g., F-001)")
  .option("--priority <n>", "Set new priority")
  .option("--name <name>", "Set new name")
  .option("--description <desc>", "Set new description")
  .action((featureId, options) => editCommand(featureId, options));

program
  .command("status")
  .description("Show feature queue and progress")
  .option("--json", "Output as JSON")
  .option("--brief", "One-line summary for sharing")
  .option("--watch", "Live-updating view (polls every 5s)")
  .option("--persist", "Keep --watch open after pipeline completes")
  .action(statusCommand);

program
  .command("run")
  .description("Show implementation guidance and next steps")
  .action(runCommand);

program
  .command("next")
  .description("Output context for the next ready feature (for Task tool)")
  .option("--json", "Output as JSON")
  .option("--feature <id>", "Get context for specific feature")
  .action((options) => nextCommand({ json: options.json, featureId: options.feature }));

program
  .command("complete")
  .description("Mark a feature as complete (validates spec.md, plan.md, tasks.md)")
  .argument("<feature-id>", "Feature ID to mark complete (e.g., F-1)")
  .option("--force", "Bypass validation (not recommended)")
  .option("--skip-doctorow", "Skip the Doctorow Gate checklist")
  .action((featureId, options) => completeCommand(featureId, { force: options.force, skipDoctorow: options.skipDoctorow }));

program
  .command("validate")
  .description("Validate that feature has completed all SpecFlow phases")
  .argument("[feature-id]", "Feature ID to validate (e.g., F-1)")
  .option("--all", "Validate all features")
  .option("--json", "Output as JSON")
  .action((featureId, options) => validateCommand(featureId, options));

program
  .command("implement")
  .description("Generate implementation prompt (validates phases first)")
  .option("--feature <id>", "Implement specific feature (default: next pending)")
  .option("--json", "Output as JSON")
  .action((options) => implementCommand({ featureId: options.feature, json: options.json }));

program
  .command("skip")
  .description("Skip a feature and move it to the end of the queue")
  .argument("<feature-id>", "Feature ID to skip (e.g., F-1)")
  .option("--reason <reason>", "Reason for skipping (duplicate, deferred, blocked, out_of_scope, superseded)")
  .option("--justification <text>", "Detailed explanation for the skip decision")
  .option("--duplicate-of <id>", "If duplicate, which feature it duplicates (required when reason=duplicate)")
  .option("--force", "Bypass validation (dangerous - migration only)")
  .action((featureId, options) => skipCommand(featureId, {
    reason: options.reason,
    justification: options.justification,
    duplicateOf: options.duplicateOf,
    force: options.force,
  }));

program
  .command("specify")
  .description("Create detailed specification for a feature (SPECIFY phase)")
  .argument("<feature-id>", "Feature ID to specify (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .option("--quick", "Quick-start mode: essential questions only, 60% threshold")
  .option("--batch", "Batch mode: non-interactive spec from rich decomposition data")
  .action((featureId, options) => specifyCommand(featureId, { dryRun: options.dryRun, quick: options.quick, batch: options.batch }));

program
  .command("specify-all")
  .description("Run batch specification for all pending features in parallel")
  .option("--dry-run", "Show what would happen without executing")
  .option("--concurrency <n>", "Number of parallel processes", "4")
  .action((options) => specifyAllCommand({ dryRun: options.dryRun, concurrency: parseInt(options.concurrency, 10) }));

program
  .command("enrich")
  .description("Add missing decomposition fields to enable batch mode")
  .argument("<feature-id>", "Feature ID to enrich (e.g., F-1)")
  .option("--problem-type <type>", "Problem type (manual_workaround, impossible, scattered, quality_issues)")
  .option("--urgency <type>", "Urgency type (external_deadline, growing_pain, blocking_work, user_demand)")
  .option("--primary-user <type>", "Primary user (developers, end_users, admins, mixed)")
  .option("--integration-scope <type>", "Integration scope (standalone, extends_existing, multiple_integrations, external_apis)")
  .option("--json", "Output as JSON")
  .action((featureId, options) => enrichCommand(featureId, {
    problemType: options.problemType,
    urgency: options.urgency,
    primaryUser: options.primaryUser,
    integrationScope: options.integrationScope,
    json: options.json,
  }));

program
  .command("plan")
  .description("Create technical plan for a feature (PLAN phase)")
  .argument("<feature-id>", "Feature ID to plan (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .action(planCommand);

program
  .command("tasks")
  .description("Create implementation tasks for a feature (TASKS phase)")
  .argument("<feature-id>", "Feature ID to break down (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .action(tasksCommand);

program
  .command("reset")
  .description("Reset a feature to pending status")
  .argument("[feature-id]", "Feature ID to reset (e.g., F-1)")
  .option("--all", "Reset all features to pending")
  .action(resetCommand);

program
  .command("revise")
  .description("Revise a spec/plan/tasks artifact based on feedback")
  .argument("<feature-id>", "Feature ID to revise (e.g., F-1)")
  .option("--spec", "Revise the spec.md artifact")
  .option("--plan", "Revise the plan.md artifact")
  .option("--tasks", "Revise the tasks.md artifact")
  .option("--feedback <text>", "Feedback to incorporate")
  .option("--dry-run", "Show what would happen without executing")
  .option("--history", "Show revision history for this feature")
  .action((featureId, options) => reviseCommand(featureId, {
    spec: options.spec,
    plan: options.plan,
    tasks: options.tasks,
    feedback: options.feedback,
    dryRun: options.dryRun,
    history: options.history,
  }));

program
  .command("contrib-prep")
  .description("Prepare code for contribution (inventory → sanitize → extract → verify)")
  .argument("<feature-id>", "Feature ID to prepare for contribution")
  .option("--inventory", "Generate file inventory only")
  .option("--sanitize", "Run sanitization scan only")
  .option("--extract", "Extract to contrib branch (requires passing sanitization)")
  .option("--verify", "Verify contrib branch")
  .option("--base <branch>", "Base branch for contrib (default: main)")
  .option("--tag <name>", "Custom tag name (default: <project>-v<version>)")
  .option("--dry-run", "Show what would happen without making changes")
  .option("-y, --yes", "Skip confirmation prompts (NOT gates — gates always pause)")
  .action((featureId, options) =>
    contribPrepCommand(featureId, {
      inventory: options.inventory,
      sanitize: options.sanitize,
      extract: options.extract,
      verify: options.verify,
      base: options.base,
      tag: options.tag,
      dryRun: options.dryRun,
      yes: options.yes,
    })
  );

// Register phase command (uses Commander directly for flexibility)
phaseCommand(program);

// Register eval command group
evalCommand(program);

// Register brownfield command group
brownfieldCommand(program);

// Register review command
reviewCommand(program);

// Register release command
releaseCommand(program);

// Register version command group
versionCommand(program);

program
  .command("approve")
  .description("Approve a pending gate for a feature")
  .argument("<feature-id>", "Feature ID to approve (e.g., F-1)")
  .action(approveCommand);

program
  .command("reject")
  .description("Reject a pending gate for a feature")
  .argument("<feature-id>", "Feature ID to reject (e.g., F-1)")
  .option("--reason <text>", "Reason for rejection (required)")
  .action((featureId, options) => rejectCommand(featureId, { reason: options.reason }));

program
  .command("pending")
  .description("List all pending approval gates")
  .action(pendingCommand);

const pipelineCmd = program
  .command("pipeline")
  .description("Pipeline management commands");

pipelineCmd
  .command("resume")
  .description("Resume a blocked pipeline from the last successful phase")
  .argument("<feature-id>", "Feature ID to resume (e.g., F-1)")
  .action(pipelineResumeCommand);

program
  .command("log")
  .description("Display execution timeline for a feature")
  .argument("<feature-id>", "Feature ID to show log for (e.g., F-1)")
  .option("--json", "Output as JSON")
  .action((featureId, options) => logCommand(featureId, { json: options.json }));

program
  .command("rollback")
  .description("Rollback a feature to a specific phase using git SHA tracking")
  .argument("<feature-id>", "Feature ID to rollback (e.g., F-1)")
  .option("--to-phase <phase>", "Phase to rollback to (specify, plan, tasks, implement)")
  .option("--confirm", "Confirm the destructive rollback operation")
  .action((featureId, options) => rollbackCommand(featureId, { toPhase: options.toPhase, confirm: options.confirm }));

program
  .command("autorun")
  .description("Drive all pending features through the full lifecycle (specify -> plan -> tasks -> implement -> complete)")
  .option("--dry-run", "Show planned phases without executing")
  .option("--max-features <n>", "Limit features processed (0 = unlimited)")
  .option("--continue-on-error", "Skip failed features and continue")
  .option("--start-from <id>", "Start from a specific feature ID")
  .option("--delay <seconds>", "Delay between features in seconds", "3")
  .action((options) => autorunCommand({
    dryRun: options.dryRun,
    maxFeatures: options.maxFeatures,
    continueOnError: options.continueOnError,
    startFrom: options.startFrom,
    delay: options.delay,
  }));

program
  .command("evolve")
  .description("Evolve a completed feature into a new iteration")
  .argument("<feature-id>", "Feature ID to evolve (e.g., F-1)")
  .option("--dry-run", "Show what would happen without executing")
  .option("--json", "Output as JSON")
  .action((featureId, options) => evolveCommand(featureId, { dryRun: options.dryRun, json: options.json }));

program
  .command("request-changes")
  .description("Request changes on a feature pending approval")
  .argument("<feature-id>", "Feature ID to request changes on (e.g., F-1)")
  .option("--reason <text>", "Reason for requesting changes (required)")
  .action((featureId, options) => requestChangesCommand(featureId, { reason: options.reason }));

program
  .command("harden")
  .description("Run guided acceptance testing protocol against spec criteria")
  .argument("[feature-id]", "Feature ID to harden (e.g., F-1)")
  .option("--dry-run", "Generate acceptance test specification without interactive session")
  .option("--all", "Harden all features at implement phase")
  .option("--status", "Show hardening progress across all features")
  .option("--only <ids>", "Only run specific test cases (comma-separated: TC-1,TC-3,TC-5)")
  .option("--from <id>", "Resume from specific test case (e.g., TC-5)")
  .action((featureId, options) => hardenCommand(featureId, {
    dryRun: options.dryRun,
    all: options.all,
    status: options.status,
    only: options.only,
    from: options.from,
  }));

program
  .command("test-track")
  .description("Track unit test results with traceability across iterations")
  .option("--status", "Show test progress summary")
  .option("--history", "Show test run history")
  .option("--limit <n>", "Limit history entries shown", "10")
  .option("--run", "Run tests and track results")
  .option("--json", "Output as JSON")
  .action((options) => testTrackCommand({
    status: options.status,
    history: options.history,
    limit: options.limit ? parseInt(options.limit, 10) : undefined,
    run: options.run,
    json: options.json,
  }));

program
  .command("tdd")
  .description("Run TDD loop with automatic test tracking and iteration history")
  .option("--status", "Show current TDD progress")
  .option("--converge", "Loop until all tests pass (interactive)")
  .option("--max-iterations <n>", "Max iterations in converge mode", "50")
  .option("--pattern <glob>", "Test file pattern to run")
  .option("-v, --verbose", "Show detailed test output")
  .action((options) => tddCommand({
    status: options.status,
    converge: options.converge,
    maxIterations: options.maxIterations ? parseInt(options.maxIterations, 10) : undefined,
    pattern: options.pattern,
    verbose: options.verbose,
  }));

program
  .command("ui")
  .description("Start the SpecFlow web dashboard")
  .option("--port <port>", "Port to run server on", "3000")
  .action(uiCommand);

program
  .command("migrate-registry")
  .description("Migrate specs from SpecKit JSON registry to project-local databases")
  .option("--dry-run", "Show what would be migrated without making changes")
  .option("--registry <path>", "Path to spec-registry.json")
  .action((options) => migrateRegistryCommand({ dryRun: options.dryRun, registry: options.registry }));

program
  .command("migrate")
  .description("Run database schema migrations")
  .option("--status", "Show migration status without running")
  .option("--rollback", "Rollback the last applied migration")
  .option("--verify", "Verify migration checksums match")
  .action((options) => migrateCommand({ status: options.status, rollback: options.rollback, verify: options.verify }));

// =============================================================================
// Parse and Execute
// =============================================================================

program.parse();
