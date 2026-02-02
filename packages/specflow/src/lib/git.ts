/**
 * Git SHA Utilities
 * Non-blocking git operations for execution audit logging
 */

import { execSync } from "child_process";

/**
 * Get the current HEAD SHA
 * Returns null if git is unavailable (never blocks pipeline)
 */
export function getHeadSha(projectPath: string): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: projectPath, encoding: "utf-8" }).trim();
  } catch {
    console.warn("[specflow:git] Could not get HEAD SHA — git may not be available");
    return null;
  }
}

/**
 * Check if a SHA exists in the repository
 */
export function shaExists(projectPath: string, sha: string): boolean {
  try {
    execSync(`git cat-file -t ${sha}`, { cwd: projectPath, encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset to a specific SHA
 */
export function resetToSha(projectPath: string, sha: string, mode: "hard" | "soft" | "mixed" = "hard"): void {
  if (!shaExists(projectPath, sha)) {
    throw new Error(`SHA ${sha} does not exist in repository`);
  }
  execSync(`git reset --${mode} ${sha}`, { cwd: projectPath, encoding: "utf-8" });
}

/**
 * Check if the working tree is dirty
 */
export function isWorkingTreeDirty(projectPath: string): boolean {
  try {
    const output = execSync("git status --porcelain", { cwd: projectPath, encoding: "utf-8" });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

// =============================================================================
// Tag Operations (F-020: Semantic Versioning)
// =============================================================================

/**
 * List all tags matching v*.*.* pattern, newest first
 */
export function listSemverTags(projectPath: string): string[] {
  try {
    const output = execSync('git tag -l "v*" --sort=-version:refname', {
      cwd: projectPath,
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((t) => t.length > 0);
  } catch {
    return [];
  }
}

/**
 * Create an annotated git tag with a message
 */
export function createAnnotatedTag(
  projectPath: string,
  tag: string,
  message: string
): void {
  execSync(`git tag -a "${tag}" -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: projectPath,
    encoding: "utf-8",
  });
}

/**
 * Count commits since a given ref
 */
export function commitCountSince(projectPath: string, ref: string): number {
  try {
    const output = execSync(`git rev-list ${ref}..HEAD --count`, {
      cwd: projectPath,
      encoding: "utf-8",
    });
    return parseInt(output.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Check if a specific tag points at HEAD
 */
export function tagExistsAtHead(projectPath: string, tag: string): boolean {
  try {
    const output = execSync("git tag --points-at HEAD", {
      cwd: projectPath,
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .some((t) => t.trim() === tag);
  } catch {
    return false;
  }
}

/**
 * Get the date a tag was created (ISO format)
 */
export function getTagDate(projectPath: string, tag: string): string | null {
  try {
    const output = execSync(`git log -1 --format=%aI "${tag}"`, {
      cwd: projectPath,
      encoding: "utf-8",
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}
