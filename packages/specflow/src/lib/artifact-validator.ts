/**
 * Artifact Validator
 * Validates that required/optional artifacts exist for a phase
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import type { SpecPhase, SpecflowConfig } from "../types";
import { getArtifactRequirements } from "./config";

export interface ValidationResult {
  valid: boolean;
  missing_required: string[];
  missing_optional: string[];
}

/**
 * Validate phase artifacts for a feature
 * Returns valid:true if all required artifacts exist
 */
export function validatePhaseArtifacts(
  projectPath: string,
  featureId: string,
  phase: SpecPhase,
  config: SpecflowConfig
): ValidationResult {
  // implement phase has no file-based validation
  if (phase === "implement" || phase === "none") {
    return { valid: true, missing_required: [], missing_optional: [] };
  }

  const requirements = getArtifactRequirements(config, phase);

  // Find the feature's spec directory
  const specsDir = join(projectPath, ".specify", "specs");
  if (!existsSync(specsDir)) {
    return {
      valid: requirements.required.length === 0,
      missing_required: requirements.required,
      missing_optional: requirements.optional,
    };
  }

  // Find matching spec directory by feature slug
  const featureSlug = featureId.toLowerCase();
  let specDir: string | null = null;

  try {
    const dirs = readdirSync(specsDir);
    const match = dirs.find((d) => d.startsWith(featureSlug));
    if (match) specDir = join(specsDir, match);
  } catch {
    // Directory read failed
  }

  if (!specDir) {
    return {
      valid: requirements.required.length === 0,
      missing_required: requirements.required,
      missing_optional: requirements.optional,
    };
  }

  const missing_required: string[] = [];
  const missing_optional: string[] = [];

  for (const file of requirements.required) {
    if (!existsSync(join(specDir, file))) {
      missing_required.push(file);
    }
  }

  for (const file of requirements.optional) {
    if (!existsSync(join(specDir, file))) {
      missing_optional.push(file);
    }
  }

  return {
    valid: missing_required.length === 0,
    missing_required,
    missing_optional,
  };
}
