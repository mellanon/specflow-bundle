/**
 * Feedback Writer
 * Append-only feedback file for review gate feedback loop
 */

import { existsSync, readFileSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";

const REVIEWS_DIR = ".specify/reviews";

/**
 * Get the feedback file path for a feature
 */
function getFeedbackPath(projectPath: string, featureId: string): string {
  return join(projectPath, REVIEWS_DIR, featureId, "feedback.md");
}

/**
 * Count existing feedback rounds by counting ## Round headers
 */
export function getFeedbackRound(projectPath: string, featureId: string): number {
  const filePath = getFeedbackPath(projectPath, featureId);
  if (!existsSync(filePath)) return 0;

  const content = readFileSync(filePath, "utf-8");
  const matches = content.match(/^## Round \d+/gm);
  return matches ? matches.length : 0;
}

/**
 * Append feedback to the feedback file
 * Creates the file and directory if they don't exist
 */
export function appendFeedback(
  projectPath: string,
  featureId: string,
  reason: string
): { round: number; filePath: string } {
  const filePath = getFeedbackPath(projectPath, featureId);
  const dir = join(projectPath, REVIEWS_DIR, featureId);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const currentRound = getFeedbackRound(projectPath, featureId);
  const newRound = currentRound + 1;
  const timestamp = new Date().toISOString();

  const entry = `## Round ${newRound} — ${timestamp}\n\n${reason}\n\n`;

  appendFileSync(filePath, entry);

  return { round: newRound, filePath };
}
