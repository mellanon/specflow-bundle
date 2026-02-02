/**
 * Gate Config Loader
 * Reads gate configuration from .specflow/config.yaml and spec annotations
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { GateConfig, GateUrgency, PhaseBoundary, GateEvalResult } from "../types";

/**
 * Default gate configuration
 */
export const DEFAULT_GATE_CONFIG: GateConfig = {
  gates: {
    specify_to_plan: "ambient",
    plan_to_tasks: "review",
    tasks_to_implement: "review",
    implement_to_complete: "critical",
  },
  timeout: {
    critical: "indefinite",
    review: "30m",
    ambient: "0",
  },
};

/**
 * Load gate configuration from .specflow/config.yaml
 */
export function loadGateConfig(projectPath: string): GateConfig {
  const configPath = join(projectPath, ".specflow", "config.yaml");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_GATE_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw);

    if (!parsed || !parsed.gates) {
      return { ...DEFAULT_GATE_CONFIG };
    }

    const g = parsed.gates;
    const timeout = g.timeout && typeof g.timeout === "object" ? g.timeout : DEFAULT_GATE_CONFIG.timeout;

    // Extract gate urgency mappings (exclude the timeout sub-key)
    const gates: Record<string, GateUrgency> = {};
    for (const [key, val] of Object.entries(g)) {
      if (key === "timeout") continue;
      if (typeof val === "string" && ["critical", "review", "ambient"].includes(val)) {
        gates[key] = val as GateUrgency;
      }
    }

    return {
      gates: Object.keys(gates).length > 0 ? gates : DEFAULT_GATE_CONFIG.gates,
      timeout,
    };
  } catch (err) {
    console.warn(`[gates] Failed to parse config:`, (err as Error).message);
    return { ...DEFAULT_GATE_CONFIG };
  }
}

/**
 * Parse @interrupt annotations from spec markdown content
 * Format: <!-- @interrupt:tier on boundary -->
 */
export function parseAnnotations(specContent: string): Map<PhaseBoundary, GateUrgency> {
  const annotations = new Map<PhaseBoundary, GateUrgency>();
  const regex = /<!--\s*@interrupt:(critical|review|ambient)\s+on\s+(\w+)\s*-->/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(specContent)) !== null) {
    const tier = match[1] as GateUrgency;
    const boundary = match[2] as PhaseBoundary;
    annotations.set(boundary, tier);
  }

  return annotations;
}

/**
 * Parse timeout string to milliseconds
 * Supports: "30m", "1h", "indefinite", "0"
 */
export function parseTimeout(timeoutStr: string): number | null {
  if (!timeoutStr || timeoutStr === "indefinite") return null;
  if (timeoutStr === "0") return 0;

  const match = timeoutStr.match(/^(\d+)(m|h|s)$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    default: return null;
  }
}

/**
 * Resolve gate urgency for a boundary, with annotation override
 */
export function resolveGateUrgency(
  boundary: PhaseBoundary,
  annotations: Map<PhaseBoundary, GateUrgency>,
  config: GateConfig
): GateEvalResult | null {
  // Annotation takes precedence
  const urgency = annotations.get(boundary) || config.gates[boundary];
  if (!urgency) return null;

  const timeoutStr = config.timeout[urgency] || "indefinite";
  const timeoutMs = parseTimeout(timeoutStr);

  let action: GateEvalResult["action"];
  switch (urgency) {
    case "ambient": action = "log_and_continue"; break;
    case "review": action = "notify_and_wait"; break;
    case "critical": action = "block"; break;
  }

  return { action, urgency, boundary, timeoutMs };
}
