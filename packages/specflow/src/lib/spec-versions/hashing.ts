/**
 * Content Hashing
 * SHA-256 hashing for spec content versioning
 */

import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of content
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}
