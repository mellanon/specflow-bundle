/**
 * Changelog Generator Module
 * Generates Keep a Changelog format from spec deltas
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { ChangelogEntry } from "../types";
import { getLatestVersion, getVersionTags, formatSemVer } from "./semver";
import { getTagDate } from "./git";

const CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).`;

/**
 * Build changelog entries from spec deltas since the last tag.
 * Uses dynamic require for database access (lib module pattern).
 */
export function buildChangelogEntries(
  projectPath: string
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];

  // Get version tags for grouping
  const versions = getVersionTags(projectPath);

  // Build unreleased entry from spec deltas
  const unreleased = buildUnreleasedEntry(projectPath);
  if (unreleased.added.length > 0 || unreleased.changed.length > 0 || unreleased.removed.length > 0) {
    entries.push(unreleased);
  } else {
    // Always include Unreleased section, even if empty
    entries.push({ version: "Unreleased", date: null, added: [], changed: [], removed: [] });
  }

  // Build entries for each tagged version
  for (const ver of versions) {
    const tagDate = getTagDate(projectPath, ver.raw);
    const dateStr = tagDate ? tagDate.substring(0, 10) : null;
    const entry: ChangelogEntry = {
      version: ver.raw,
      date: dateStr,
      added: [],
      changed: [],
      removed: [],
    };

    // Query spec deltas for this version's timeframe
    try {
      const { initDatabase, closeDatabase, getDbPath, dbExists } = require("../lib/database");
      if (!dbExists(projectPath)) {
        entries.push(entry);
        continue;
      }
      const dbPath = getDbPath(projectPath);
      const db = initDatabase(dbPath);
      if (db) {
        const rows = db.prepare(`
          SELECT sd.change_type, sd.section_path, sd.diff_content, f.name as feature_name
          FROM spec_deltas sd
          JOIN features f ON sd.feature_id = f.id
          WHERE f.completed_at IS NOT NULL
          ORDER BY sd.feature_id, sd.to_version
        `).all() as Array<{ change_type: string; section_path: string; diff_content: string | null; feature_name: string }>;

        for (const row of rows) {
          const text = `${row.feature_name} (${row.section_path})`;
          switch (row.change_type) {
            case "ADDED":
              entry.added.push(text);
              break;
            case "MODIFIED":
              entry.changed.push(text);
              break;
            case "REMOVED":
              entry.removed.push(text);
              break;
          }
        }
        closeDatabase();
      }
    } catch {
      // Gracefully handle missing tables or database issues
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Build the unreleased changelog entry from spec deltas
 */
function buildUnreleasedEntry(projectPath: string): ChangelogEntry {
  const entry: ChangelogEntry = {
    version: "Unreleased",
    date: null,
    added: [],
    changed: [],
    removed: [],
  };

  try {
    const { initDatabase, closeDatabase, getDbPath, dbExists } = require("../lib/database");
    if (!dbExists(projectPath)) return entry;

    const dbPath = getDbPath(projectPath);
    const db = initDatabase(dbPath);
    if (!db) return entry;

    // Get the latest tag date to filter deltas
    const latest = getLatestVersion(projectPath);
    const sinceDate = latest ? getTagDate(projectPath, latest.raw) : null;

    let query = `
      SELECT sd.change_type, sd.section_path, sd.diff_content, f.name as feature_name, f.id as feature_id
      FROM spec_deltas sd
      JOIN features f ON sd.feature_id = f.id
      WHERE f.completed_at IS NOT NULL
    `;
    const params: any[] = [];

    if (sinceDate) {
      query += " AND f.completed_at > ?";
      params.push(sinceDate);
    }

    query += " ORDER BY f.id, sd.to_version";

    const rows = db.prepare(query).all(...params) as Array<{
      change_type: string;
      section_path: string;
      diff_content: string | null;
      feature_name: string;
      feature_id: string;
    }>;

    for (const row of rows) {
      const text = `${row.feature_id}: ${row.feature_name} (${row.section_path})`;
      switch (row.change_type) {
        case "ADDED":
          entry.added.push(text);
          break;
        case "MODIFIED":
          entry.changed.push(text);
          break;
        case "REMOVED":
          entry.removed.push(text);
          break;
      }
    }

    closeDatabase();
  } catch {
    // Gracefully handle missing spec_deltas table
  }

  // If no spec deltas, try git log as fallback
  if (entry.added.length === 0 && entry.changed.length === 0 && entry.removed.length === 0) {
    try {
      const latest = getLatestVersion(projectPath);
      const range = latest ? `${latest.raw}..HEAD` : "HEAD";
      const output = execSync(`git log --oneline ${range}`, {
        cwd: projectPath,
        encoding: "utf-8",
      }).trim();
      if (output) {
        for (const line of output.split("\n").slice(0, 20)) {
          entry.added.push(line.replace(/^[a-f0-9]+ /, ""));
        }
      }
    } catch {
      // No git log available
    }
  }

  return entry;
}

/**
 * Render changelog entries to Keep a Changelog markdown
 */
export function renderChangelog(entries: ChangelogEntry[]): string {
  const sections: string[] = [CHANGELOG_HEADER, ""];

  for (const entry of entries) {
    if (entry.version === "Unreleased") {
      sections.push("## [Unreleased]");
    } else {
      const datePart = entry.date ? ` - ${entry.date}` : "";
      sections.push(`## [${entry.version}]${datePart}`);
    }

    if (entry.added.length > 0) {
      sections.push("");
      sections.push("### Added");
      for (const item of entry.added) {
        sections.push(`- ${item}`);
      }
    }

    if (entry.changed.length > 0) {
      sections.push("");
      sections.push("### Changed");
      for (const item of entry.changed) {
        sections.push(`- ${item}`);
      }
    }

    if (entry.removed.length > 0) {
      sections.push("");
      sections.push("### Removed");
      for (const item of entry.removed) {
        sections.push(`- ${item}`);
      }
    }

    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Merge new changelog content with existing CHANGELOG.md.
 * Only updates [Unreleased] section; preserves version history.
 */
export function mergeWithExisting(
  projectPath: string,
  newContent: string
): string {
  const changelogPath = join(projectPath, "CHANGELOG.md");
  if (!existsSync(changelogPath)) return newContent;

  const existing = readFileSync(changelogPath, "utf-8");

  // Find existing versioned sections (## [vX.Y.Z])
  const versionSectionRegex = /^## \[v\d+\.\d+\.\d+\]/m;
  const existingVersionMatch = existing.match(versionSectionRegex);

  if (!existingVersionMatch) {
    // No existing version sections, use new content as-is
    return newContent;
  }

  // Extract existing versioned content (from first version section onwards)
  const existingVersionIdx = existing.indexOf(existingVersionMatch[0]);
  const existingVersionContent = existing.substring(existingVersionIdx);

  // Extract new header + unreleased from new content
  const newVersionMatch = newContent.match(versionSectionRegex);
  let newHeaderAndUnreleased: string;
  if (newVersionMatch) {
    const newVersionIdx = newContent.indexOf(newVersionMatch[0]);
    newHeaderAndUnreleased = newContent.substring(0, newVersionIdx);
  } else {
    newHeaderAndUnreleased = newContent;
  }

  return newHeaderAndUnreleased + existingVersionContent;
}

/**
 * Write CHANGELOG.md to disk
 */
export function writeChangelog(projectPath: string, content: string): void {
  const changelogPath = join(projectPath, "CHANGELOG.md");
  writeFileSync(changelogPath, content, "utf-8");
}

/**
 * Generate changelog (full pipeline).
 * Returns the generated content string.
 */
export function generateChangelog(
  projectPath: string,
  options?: { dryRun?: boolean }
): string {
  const entries = buildChangelogEntries(projectPath);
  const content = renderChangelog(entries);
  const merged = mergeWithExisting(projectPath, content);

  if (!options?.dryRun) {
    writeChangelog(projectPath, merged);
  }

  return merged;
}

/**
 * Build tag annotation message from spec deltas.
 * Falls back to git log --oneline if no deltas.
 */
export function buildTagMessage(
  projectPath: string,
  newTag: string,
  previousTag: string | null
): string {
  const lines: string[] = [newTag, ""];

  if (previousTag) {
    lines.push(`Changes since ${previousTag}:`);
  } else {
    lines.push("Initial release:");
  }

  // Try spec deltas first
  try {
    const { initDatabase, closeDatabase, getDbPath, dbExists } = require("../lib/database");
    if (dbExists(projectPath)) {
      const dbPath = getDbPath(projectPath);
      const db = initDatabase(dbPath);
      if (db) {
        const sinceDate = previousTag ? getTagDate(projectPath, previousTag) : null;
        let query = `
          SELECT DISTINCT f.id, f.name, sd.change_type
          FROM spec_deltas sd
          JOIN features f ON sd.feature_id = f.id
          WHERE f.completed_at IS NOT NULL
        `;
        const params: any[] = [];
        if (sinceDate) {
          query += " AND f.completed_at > ?";
          params.push(sinceDate);
        }
        query += " ORDER BY f.id";

        const rows = db.prepare(query).all(...params) as Array<{
          id: string;
          name: string;
          change_type: string;
        }>;

        for (const row of rows) {
          lines.push(`- ${row.id}: ${row.name} (${row.change_type})`);
        }

        closeDatabase();

        if (rows.length > 0) {
          lines.push("");
          lines.push("Generated by specflow version bump");
          return lines.join("\n");
        }
      }
    }
  } catch {
    // Fall through to git log
  }

  // Fallback: git log --oneline
  try {
    const range = previousTag ? `${previousTag}..HEAD` : "HEAD~10..HEAD";
    const output = execSync(`git log --oneline ${range}`, {
      cwd: projectPath,
      encoding: "utf-8",
    }).trim();
    if (output) {
      for (const line of output.split("\n").slice(0, 20)) {
        lines.push(`- ${line}`);
      }
    }
  } catch {
    lines.push("- (no changes detected)");
  }

  lines.push("");
  lines.push("Generated by specflow version bump");
  return lines.join("\n");
}
