/**
 * Notification Config Loader
 * Reads .specflow/config.yaml and returns NotificationConfig with defaults
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { NotificationConfig, NotificationTier } from "../../types";

/**
 * Default notification configuration
 */
export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  notification_backends: ["voice", "desktop"],
  webhook_url: "",
  default_urgency_by_phase: {
    decompose: "ambient",
    specify: "review",
    plan: "review",
    tasks: "review",
    implement: "review",
  },
  failure_urgency: "critical",
};

/**
 * Load notification config from .specflow/config.yaml
 * Re-reads file on every call (no caching) to allow hot-reload
 * Returns defaults if file missing or invalid
 */
export function loadNotificationConfig(projectPath: string): NotificationConfig {
  const configPath = join(projectPath, ".specflow", "config.yaml");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_NOTIFICATION_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw);

    if (!parsed || !parsed.notifications) {
      return { ...DEFAULT_NOTIFICATION_CONFIG };
    }

    const n = parsed.notifications;

    return {
      notification_backends: Array.isArray(n.notification_backends)
        ? n.notification_backends
        : DEFAULT_NOTIFICATION_CONFIG.notification_backends,
      webhook_url: typeof n.webhook_url === "string"
        ? n.webhook_url
        : DEFAULT_NOTIFICATION_CONFIG.webhook_url,
      default_urgency_by_phase: n.default_urgency_by_phase && typeof n.default_urgency_by_phase === "object"
        ? n.default_urgency_by_phase
        : DEFAULT_NOTIFICATION_CONFIG.default_urgency_by_phase,
      failure_urgency: (["critical", "review", "ambient"] as NotificationTier[]).includes(n.failure_urgency)
        ? n.failure_urgency
        : DEFAULT_NOTIFICATION_CONFIG.failure_urgency,
    };
  } catch (err) {
    console.warn(`[notifications] Failed to parse config at ${configPath}:`, (err as Error).message);
    return { ...DEFAULT_NOTIFICATION_CONFIG };
  }
}
