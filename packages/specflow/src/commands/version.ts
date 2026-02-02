/**
 * Version Command
 * Semantic versioning and changelog management
 */

import { Command } from "commander";
import {
  initDatabase,
  closeDatabase,
  getDbPath,
  dbExists,
} from "../lib/database";
import {
  getLatestVersion,
  getVersionInfo,
  bumpVersion,
  createVersionTag,
  formatSemVer,
} from "../lib/semver";
import { generateChangelog, buildTagMessage } from "../lib/changelog";
import type { BumpLevel } from "../types";

const VALID_LEVELS = ["major", "minor", "patch"];

/**
 * Register the version command group on the program
 */
export function versionCommand(program: Command): void {
  const ver = program
    .command("version")
    .description("Semantic versioning and changelog management");

  ver
    .command("bump")
    .description("Create a new version tag (major | minor | patch)")
    .argument("<level>", "Bump level: major, minor, or patch")
    .option("--dry-run", "Preview without creating tag")
    .action(bumpAction);

  ver
    .command("current")
    .description("Show current version and commit distance")
    .option("--json", "Output as JSON")
    .action(currentAction);

  ver
    .command("changelog")
    .description("Generate/update CHANGELOG.md from spec deltas")
    .option("--dry-run", "Preview changelog without writing")
    .action(changelogAction);
}

async function bumpAction(level: string, options: { dryRun?: boolean }): Promise<void> {
  if (!VALID_LEVELS.includes(level)) {
    console.error(`Error: Invalid bump level '${level}'. Use: major, minor, or patch.`);
    process.exit(1);
  }

  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  try {
    initDatabase(getDbPath(projectPath));

    const current = getLatestVersion(projectPath);
    const next = bumpVersion(current, level as BumpLevel);
    const previousTag = current ? formatSemVer(current) : null;
    const nextTag = formatSemVer(next);

    if (options.dryRun) {
      console.log(`[DRY RUN] Would create tag: ${nextTag}`);
      console.log(`  Current: ${previousTag ?? "(none)"}`);
      console.log(`  Next:    ${nextTag}`);
      return;
    }

    // Build tag annotation message
    const message = buildTagMessage(projectPath, nextTag, previousTag);

    const result = createVersionTag(projectPath, next, message);

    if (result.created) {
      console.log(`Created tag: ${result.tag}`);
      if (previousTag) {
        console.log(`  Bumped from ${previousTag} (${level})`);
      } else {
        console.log(`  Initial version (from v0.0.0 baseline)`);
      }
    } else {
      console.error(`Error: HEAD is already tagged as ${result.tag}. Commit new changes before bumping.`);
      process.exit(1);
    }
  } finally {
    closeDatabase();
  }
}

async function currentAction(options: { json?: boolean }): Promise<void> {
  const projectPath = process.cwd();

  const info = getVersionInfo(projectPath);

  if (!info) {
    if (options.json) {
      console.log(JSON.stringify({ version: null, commitsSince: 0, dirty: false }));
    } else {
      console.log("No version tags found. Run 'specflow version bump <level>' to create one.");
    }
    return;
  }

  if (options.json) {
    console.log(
      JSON.stringify({
        version: info.current.raw,
        major: info.current.major,
        minor: info.current.minor,
        patch: info.current.patch,
        commitsSince: info.commitsSince,
        dirty: info.dirty,
      })
    );
  } else {
    console.log(`${info.current.raw}`);
    if (info.commitsSince > 0) {
      console.log(`  ${info.commitsSince} commit(s) since tag`);
    } else {
      console.log(`  (at tagged commit)`);
    }
    if (info.dirty) {
      console.log(`  Working tree has uncommitted changes`);
    }
  }
}

async function changelogAction(options: { dryRun?: boolean }): Promise<void> {
  const projectPath = process.cwd();

  if (!dbExists(projectPath)) {
    console.error("Error: No SpecFlow database found. Run 'specflow init' first.");
    process.exit(1);
  }

  try {
    initDatabase(getDbPath(projectPath));

    const content = generateChangelog(projectPath, { dryRun: options.dryRun });

    if (options.dryRun) {
      console.log("[DRY RUN] Changelog preview:\n");
      console.log(content);
    } else {
      console.log("CHANGELOG.md updated.");
    }
  } finally {
    closeDatabase();
  }
}
