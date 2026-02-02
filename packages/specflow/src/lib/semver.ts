/**
 * Semantic Versioning Module
 * Parse, bump, and manage semver git tags
 */

import type { SemVer, BumpLevel, VersionInfo } from "../types";
import {
  listSemverTags,
  createAnnotatedTag,
  commitCountSince,
  tagExistsAtHead,
  isWorkingTreeDirty,
} from "./git";

const SEMVER_REGEX = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a tag string like "v1.2.3" into a SemVer object.
 * Returns null for non-conforming tags.
 */
export function parseSemVer(tag: string): SemVer | null {
  const match = tag.match(SEMVER_REGEX);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: tag,
  };
}

/**
 * Format a SemVer object back to a tag string
 */
export function formatSemVer(v: SemVer): string {
  return `v${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Get all semver tags parsed and sorted descending
 */
export function getVersionTags(projectPath: string): SemVer[] {
  const tags = listSemverTags(projectPath);
  return tags
    .map(parseSemVer)
    .filter((v): v is SemVer => v !== null)
    .sort((a, b) => {
      if (a.major !== b.major) return b.major - a.major;
      if (a.minor !== b.minor) return b.minor - a.minor;
      return b.patch - a.patch;
    });
}

/**
 * Get the latest semver tag or null if none exist
 */
export function getLatestVersion(projectPath: string): SemVer | null {
  const tags = getVersionTags(projectPath);
  return tags.length > 0 ? tags[0] : null;
}

/**
 * Get full version info including commit distance and dirty state
 */
export function getVersionInfo(projectPath: string): VersionInfo | null {
  const latest = getLatestVersion(projectPath);
  if (!latest) return null;
  return {
    current: latest,
    commitsSince: commitCountSince(projectPath, latest.raw),
    dirty: isWorkingTreeDirty(projectPath),
  };
}

/**
 * Compute the next version by bumping from current.
 * If current is null, starts from v0.0.0 baseline.
 */
export function bumpVersion(current: SemVer | null, level: BumpLevel): SemVer {
  const base = current ?? { major: 0, minor: 0, patch: 0, raw: "v0.0.0" };

  switch (level) {
    case "major":
      return {
        major: base.major + 1,
        minor: 0,
        patch: 0,
        raw: `v${base.major + 1}.0.0`,
      };
    case "minor":
      return {
        major: base.major,
        minor: base.minor + 1,
        patch: 0,
        raw: `v${base.major}.${base.minor + 1}.0`,
      };
    case "patch":
      return {
        major: base.major,
        minor: base.minor,
        patch: base.patch + 1,
        raw: `v${base.major}.${base.minor}.${base.patch + 1}`,
      };
  }
}

/**
 * Create a version tag. Idempotent: if tag already exists at HEAD, returns created=false.
 */
export function createVersionTag(
  projectPath: string,
  version: SemVer,
  message: string
): { created: boolean; tag: string } {
  const tag = formatSemVer(version);

  if (tagExistsAtHead(projectPath, tag)) {
    return { created: false, tag };
  }

  createAnnotatedTag(projectPath, tag, message);
  return { created: true, tag };
}

/**
 * Check if any semver tag exists in the repo
 */
export function hasVersionTag(projectPath: string): boolean {
  return getVersionTags(projectPath).length > 0;
}
