/**
 * Spec Section Diff
 * Compares two markdown specs by section and identifies ADDED/MODIFIED/REMOVED sections
 */

import type { SpecChangeType } from "../../types";

export interface SectionDiff {
  changeType: SpecChangeType;
  sectionPath: string;
  diffContent: string;
}

/**
 * Parse a markdown document into a map of section paths to content.
 * Section paths are derived from heading hierarchy (e.g., "Requirements > Functional > Auth").
 */
export function parseSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.split("\n");
  const headingStack: string[] = [];
  let currentContent: string[] = [];
  let currentPath = "";

  function flushSection() {
    if (currentPath) {
      sections.set(currentPath, currentContent.join("\n").trim());
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushSection();

      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // Trim stack to parent level
      headingStack.length = level - 1;
      headingStack.push(title);

      currentPath = headingStack.join(" > ");
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  flushSection();
  return sections;
}

/**
 * Compute diffs between two spec versions by comparing their section structure.
 */
export function computeSectionDiffs(
  oldContent: string,
  newContent: string
): SectionDiff[] {
  const oldSections = parseSections(oldContent);
  const newSections = parseSections(newContent);
  const diffs: SectionDiff[] = [];

  // Check for REMOVED and MODIFIED sections
  for (const [path, oldText] of oldSections) {
    const newText = newSections.get(path);
    if (newText === undefined) {
      diffs.push({
        changeType: "REMOVED",
        sectionPath: path,
        diffContent: oldText.substring(0, 500),
      });
    } else if (oldText !== newText) {
      diffs.push({
        changeType: "MODIFIED",
        sectionPath: path,
        diffContent: `- ${oldText.substring(0, 250)}\n+ ${newText.substring(0, 250)}`,
      });
    }
  }

  // Check for ADDED sections
  for (const [path, newText] of newSections) {
    if (!oldSections.has(path)) {
      diffs.push({
        changeType: "ADDED",
        sectionPath: path,
        diffContent: newText.substring(0, 500),
      });
    }
  }

  return diffs;
}
