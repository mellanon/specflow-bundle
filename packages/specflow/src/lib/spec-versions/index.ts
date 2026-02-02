/**
 * Spec Versions Module
 * Re-exports for convenience
 */

export {
  createSpecVersion,
  getSpecVersion,
  getLatestSpecVersion,
  getSpecVersions,
  createSpecDelta,
  getSpecDelta,
  getSpecDeltas,
  getAllSpecDeltas,
  deleteSpecHistory,
} from "./state";

export { hashContent } from "./hashing";

export { parseSections, computeSectionDiffs } from "./diff";
export type { SectionDiff } from "./diff";
