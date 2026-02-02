/**
 * Specflow Config Loader
 * Reads .specflow/config.yaml for artifact requirements and pipeline settings
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { SpecflowConfig, ArtifactRequirement, ArtifactRequirements, SpecPhase, NormalizedHookEntry, HookEntry } from "../types";

/**
 * Default artifact requirements per phase
 */
export const DEFAULT_ARTIFACT_REQUIREMENTS: ArtifactRequirements = {
  specify: { required: ["spec.md"], optional: [] },
  plan: { required: ["plan.md"], optional: ["architecture.md"] },
  tasks: { required: ["tasks.md"], optional: [] },
  implement: { required: [], optional: [] },
};

/**
 * Load specflow configuration from .specflow/config.yaml
 */
export function loadSpecflowConfig(projectPath: string): SpecflowConfig {
  const configPath = join(projectPath, ".specflow", "config.yaml");

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw);
    return parsed || {};
  } catch (err) {
    console.warn(`[specflow] Failed to parse config:`, (err as Error).message);
    return {};
  }
}

/**
 * Get artifact requirements for a phase
 * Custom config fully replaces defaults per phase (no merging)
 */
export function getArtifactRequirements(config: SpecflowConfig, phase: SpecPhase): ArtifactRequirement {
  if (config.artifact_requirements && config.artifact_requirements[phase]) {
    const custom = config.artifact_requirements[phase]!;
    return {
      required: Array.isArray(custom.required) ? custom.required : [],
      optional: Array.isArray(custom.optional) ? custom.optional : [],
    };
  }

  return DEFAULT_ARTIFACT_REQUIREMENTS[phase] || { required: [], optional: [] };
}

/**
 * Get max resume count from config
 */
export function getMaxResumeCount(config: SpecflowConfig): number {
  return config.pipeline?.max_resume_count ?? 3;
}

// =============================================================================
// Phase Hooks
// =============================================================================

const CANONICAL_PHASES = ["specify", "plan", "tasks", "implement"];
const DEFAULT_HOOK_TIMEOUT = 30;

/**
 * Get normalized hook entries for a given phase and position.
 * Returns [] when no hooks are configured.
 */
export function getPhaseHooks(
  config: SpecflowConfig,
  phase: string,
  position: "pre" | "post"
): NormalizedHookEntry[] {
  if (!config.hooks) return [];

  if (!CANONICAL_PHASES.includes(phase)) {
    console.warn(`[specflow:hooks] Unknown phase '${phase}' — skipping hooks`);
    return [];
  }

  const phaseHooks = config.hooks[phase as keyof typeof config.hooks];
  if (!phaseHooks || typeof phaseHooks !== "object") return [];

  const entries = (phaseHooks as any)[position];
  if (!Array.isArray(entries)) return [];

  const defaultTimeout = config.hooks.default_timeout ?? DEFAULT_HOOK_TIMEOUT;

  return entries
    .map((entry: HookEntry) => normalizeHookEntry(entry, defaultTimeout))
    .filter((e): e is NormalizedHookEntry => e !== null);
}

/**
 * Normalize a hook entry to { command, timeout }
 */
function normalizeHookEntry(
  entry: HookEntry,
  defaultTimeout: number
): NormalizedHookEntry | null {
  if (typeof entry === "string") {
    return { command: entry, timeout: defaultTimeout };
  }

  if (typeof entry === "object" && entry !== null && typeof entry.command === "string") {
    const timeout = typeof entry.timeout === "number" && entry.timeout > 0
      ? entry.timeout
      : defaultTimeout;
    return { command: entry.command, timeout };
  }

  console.warn(`[specflow:hooks] Invalid hook entry — skipping:`, entry);
  return null;
}
