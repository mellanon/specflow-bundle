/**
 * Review Artifact I/O — F-024
 * Atomic read/write utilities for review.json in .specify/review/{featureId}/
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import type { ReviewResult } from "../../types";

/**
 * Get the review directory for a feature, creating it if absent
 */
export function reviewDir(projectPath: string, featureId: string): string {
  const dir = join(projectPath, ".specify", "review", featureId.toLowerCase());
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Atomically write review.json for a feature
 */
export function writeReviewJson(projectPath: string, featureId: string, result: ReviewResult): string {
  const dir = reviewDir(projectPath, featureId);
  const filePath = join(dir, "review.json");
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(result, null, 2) + "\n");
  renameSync(tmp, filePath);
  return filePath;
}

/**
 * Read review.json for a feature, returning null if missing
 */
export function readReviewJson(projectPath: string, featureId: string): ReviewResult | null {
  const dir = join(projectPath, ".specify", "review", featureId.toLowerCase());
  const filePath = join(dir, "review.json");
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as ReviewResult;
}

/**
 * Read all review.json artifacts across all features
 */
export function readAllReviewJsons(projectPath: string): ReviewResult[] {
  const baseDir = join(projectPath, ".specify", "review");
  if (!existsSync(baseDir)) return [];

  const dirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const results: ReviewResult[] = [];
  for (const dir of dirs) {
    const filePath = join(baseDir, dir, "review.json");
    if (existsSync(filePath)) {
      try {
        results.push(JSON.parse(readFileSync(filePath, "utf-8")) as ReviewResult);
      } catch {
        // Skip malformed files
      }
    }
  }
  return results;
}
