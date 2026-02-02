/**
 * Brownfield Command
 * Analyze existing codebases for spec-driven development
 */

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { scanCodebase, writeScanResult } from "../lib/brownfield/scanner";
import { generateDeltaSpec, writeDeltaSpec } from "../lib/brownfield/differ";
import { loadAndFilterDelta, applyDeltaToSpec } from "../lib/brownfield/applier";
import { createSpecVersion, createSpecDelta, getLatestSpecVersion, hashContent } from "../lib/spec-versions";
import {
  initDatabase,
  closeDatabase,
  getFeature,
  getDbPath,
  dbExists,
} from "../lib/database";

// =============================================================================
// Scan Subcommand
// =============================================================================

interface ScanOptions {
  output?: string;
  json?: boolean;
}

async function scanCommand(
  targetPath: string,
  options: ScanOptions
): Promise<void> {
  const fullPath = resolve(targetPath);

  if (!existsSync(fullPath)) {
    console.error(`Error: Path does not exist: ${fullPath}`);
    process.exit(1);
  }

  console.log(`\n🔍 Scanning codebase: ${fullPath}\n`);

  const result = await scanCodebase(fullPath);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Write to .specify/brownfield/scan.json
  const projectPath = process.cwd();
  const outputPath = writeScanResult(projectPath, result);

  // Print summary
  console.log(`📊 Scan Complete`);
  console.log(`${"─".repeat(50)}`);
  console.log(`   Files:       ${result.totalFiles}`);
  console.log(`   Languages:   ${Object.keys(result.languages).join(", ")}`);
  console.log();

  // Language breakdown
  const sorted = Object.entries(result.languages).sort((a, b) => b[1] - a[1]);
  for (const [lang, count] of sorted) {
    console.log(`   ${lang.padEnd(15)} ${count} files`);
  }

  // Export/function/type totals
  const totalExports = result.files.reduce((sum, f) => sum + f.exports.length, 0);
  const totalFunctions = result.files.reduce((sum, f) => sum + f.functions.length, 0);
  const totalTypes = result.files.reduce((sum, f) => sum + f.types.length, 0);
  const totalLines = result.files.reduce((sum, f) => sum + f.lines, 0);

  console.log();
  console.log(`   Exports:     ${totalExports}`);
  console.log(`   Functions:   ${totalFunctions}`);
  console.log(`   Types:       ${totalTypes}`);
  console.log(`   Total Lines: ${totalLines.toLocaleString()}`);

  // Dependencies
  if (result.dependencies.length > 0) {
    const prodDeps = result.dependencies.filter((d) => d.type === "production").length;
    const devDeps = result.dependencies.filter((d) => d.type === "development").length;
    console.log(`   Dependencies: ${prodDeps} production, ${devDeps} development`);
  }

  console.log();
  console.log(`📁 Scan saved: ${outputPath}`);
}

// =============================================================================
// Diff Subcommand
// =============================================================================

interface DiffOptions {
  scan?: string;
  noAi?: boolean;
  json?: boolean;
}

async function diffCommand(
  featureId: string,
  options: DiffOptions
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
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
      console.error(`Error: Feature ${featureId} has no spec. Run 'specflow specify ${featureId}' first.`);
      process.exit(1);
    }

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) {
      console.error(`Error: No spec.md found at ${specFile}`);
      process.exit(1);
    }

    // Find scan file
    const scanPath = options.scan || join(projectPath, ".specify", "brownfield", "scan.json");
    if (!existsSync(scanPath)) {
      console.error(`Error: No scan found at ${scanPath}`);
      console.error("Run 'specflow brownfield scan <path>' first.");
      process.exit(1);
    }

    console.log(`\n📊 Generating delta-spec for ${featureId}...`);
    console.log(`   Scan: ${scanPath}`);
    console.log(`   Spec: ${specFile}\n`);

    const delta = await generateDeltaSpec(
      featureId,
      scanPath,
      specFile,
      projectPath,
      !options.noAi
    );

    if (options.json) {
      console.log(JSON.stringify(delta, null, 2));
      return;
    }

    const { mdPath, jsonPath } = writeDeltaSpec(projectPath, delta);

    console.log(`📋 Delta-Spec Generated`);
    console.log(`${"─".repeat(50)}`);
    console.log(`   Added:    ${delta.summary.added}`);
    console.log(`   Modified: ${delta.summary.modified}`);
    console.log(`   Removed:  ${delta.summary.removed}`);
    console.log();
    console.log(`📁 Markdown: ${mdPath}`);
    console.log(`📁 JSON:     ${jsonPath}`);
    console.log();
    console.log(`Next: Review delta-spec.md and run 'specflow brownfield apply ${featureId}'`);
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Apply Subcommand
// =============================================================================

interface ApplyCommandOptions {
  delta?: string;
  autoApprove?: boolean;
  include?: string[];
  dryRun?: boolean;
}

async function applyCommand(
  featureId: string,
  options: ApplyCommandOptions
): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
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
      console.error(`Error: Feature ${featureId} has no spec.`);
      process.exit(1);
    }

    const specFile = join(feature.specPath, "spec.md");
    if (!existsSync(specFile)) {
      console.error(`Error: No spec.md found at ${specFile}`);
      process.exit(1);
    }

    // Find delta-spec
    const deltaPath = options.delta || join(projectPath, ".specify", "brownfield", "delta-spec.json");
    if (!existsSync(deltaPath)) {
      console.error(`Error: No delta-spec found at ${deltaPath}`);
      console.error("Run 'specflow brownfield diff <feature-id>' first.");
      process.exit(1);
    }

    // Parse include types
    const includeTypes = options.include?.map((t) => t.toUpperCase() as "ADDED" | "MODIFIED" | "REMOVED");

    const { delta, approved } = loadAndFilterDelta(deltaPath, {
      autoApprove: options.autoApprove,
      includeTypes,
    });

    console.log(`\n📋 Applying delta-spec to ${featureId}`);
    console.log(`   Changes: ${approved.length} of ${delta.changes.length}`);

    if (approved.length === 0) {
      console.log("\nNo changes to apply.");
      return;
    }

    // Read current spec
    const currentSpec = readFileSync(specFile, "utf-8");

    // Apply changes
    const updatedSpec = applyDeltaToSpec(currentSpec, delta, approved);

    if (options.dryRun) {
      console.log("\n[DRY RUN] Would update spec with:");
      console.log(`   Added sections: ${approved.filter((c) => c.changeType === "ADDED").length}`);
      console.log(`   Modified sections: ${approved.filter((c) => c.changeType === "MODIFIED").length}`);
      console.log(`   Removed sections: ${approved.filter((c) => c.changeType === "REMOVED").length}`);
      return;
    }

    // Write updated spec
    writeFileSync(specFile, updatedSpec);

    // Create new spec version with delta trail
    const previousVersion = getLatestSpecVersion(featureId);
    const newVersion = createSpecVersion(featureId, hashContent(updatedSpec));
    console.log(`\n📸 Spec version ${newVersion.version} created`);

    // Record deltas
    if (previousVersion) {
      for (const change of approved) {
        createSpecDelta({
          featureId,
          fromVersion: previousVersion.version,
          toVersion: newVersion.version,
          changeType: change.changeType,
          sectionPath: `${change.category}.${change.name}`,
          diffContent: change.description,
        });
      }
      console.log(`📊 ${approved.length} delta(s) recorded (v${previousVersion.version} → v${newVersion.version})`);
    }

    console.log(`\n✓ Spec updated: ${specFile}`);
  } finally {
    closeDatabase();
  }
}

// =============================================================================
// Command Registration
// =============================================================================

export function brownfieldCommand(program: Command): void {
  const brownfield = program
    .command("brownfield")
    .description("Brownfield codebase analysis for spec-driven development");

  brownfield
    .command("scan")
    .description("Scan an existing codebase and extract structural inventory")
    .argument("<path>", "Directory to scan")
    .option("--json", "Output raw JSON instead of summary")
    .action(scanCommand);

  brownfield
    .command("diff")
    .description("Compare codebase scan against spec baseline and produce delta-spec")
    .argument("<feature-id>", "Feature ID to compare against")
    .option("--scan <path>", "Path to scan.json (default: .specify/brownfield/scan.json)")
    .option("--no-ai", "Skip AI classification, use structural diff only")
    .option("--json", "Output raw JSON")
    .action(diffCommand);

  brownfield
    .command("apply")
    .description("Apply reviewed delta-spec changes to create new spec version")
    .argument("<feature-id>", "Feature ID to update")
    .option("--delta <path>", "Path to delta-spec.json (default: .specify/brownfield/delta-spec.json)")
    .option("--auto-approve", "Auto-approve all changes (headless mode)")
    .option("--include <types...>", "Only include specific change types (ADDED, MODIFIED, REMOVED)")
    .option("--dry-run", "Show what would be applied without changing files")
    .action(applyCommand);
}
