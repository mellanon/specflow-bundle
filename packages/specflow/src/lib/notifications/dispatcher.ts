/**
 * Notification Dispatcher
 * Core routing logic: event -> tier -> backends -> fire-and-forget delivery
 */

import type {
  PhaseEvent,
  NotificationPayload,
  NotificationTier,
  NotificationBackend,
} from "../../types";
import { loadNotificationConfig } from "./config";
import { sendVoice, sendDesktop, sendWebhook, sendTerminalBlock } from "./backends";

/**
 * Tier-to-backend routing table
 */
const TIER_BACKENDS: Record<NotificationTier, NotificationBackend[]> = {
  critical: ["voice", "desktop", "webhook", "terminal-block"],
  review: ["voice", "desktop", "webhook"],
  ambient: [],
};

/**
 * Dispatch a notification for a phase transition event
 * Fire-and-forget: errors are logged but never propagated
 */
export async function notify(event: PhaseEvent, projectPath: string): Promise<void> {
  try {
    const config = loadNotificationConfig(projectPath);

    // Resolve tier
    const tier: NotificationTier =
      event.transition === "fail"
        ? config.failure_urgency
        : (config.default_urgency_by_phase[event.phase] as NotificationTier) || "review";

    // Build payload
    const payload: NotificationPayload = {
      phase: event.phase,
      transition: event.transition,
      tier,
      featureId: event.featureId,
      featureName: event.featureName,
      timestamp: event.timestamp,
      pipelineContext: event.pipelineContext,
    };

    // AMBIENT: log only
    if (tier === "ambient") {
      console.log(
        `[NOTIFY:AMBIENT] phase=${event.phase} transition=${event.transition} feature=${event.featureId}`
      );
      return;
    }

    // Determine which backends to fire
    const tierBackends = TIER_BACKENDS[tier];
    const enabledBackends = new Set(config.notification_backends);

    // Fire non-blocking backends
    const promises: Promise<void>[] = [];

    for (const backend of tierBackends) {
      // terminal-block is always on for CRITICAL (defining characteristic)
      if (backend === "terminal-block") continue;
      if (!enabledBackends.has(backend)) continue;

      switch (backend) {
        case "voice":
          promises.push(sendVoice(payload));
          break;
        case "desktop":
          promises.push(sendDesktop(payload));
          break;
        case "webhook":
          promises.push(sendWebhook(payload, config.webhook_url));
          break;
      }
    }

    // Fire all non-blocking backends in parallel
    await Promise.allSettled(promises);

    // For CRITICAL, await terminal-block AFTER other backends have settled
    if (tier === "critical") {
      await sendTerminalBlock(payload);
    }
  } catch (err) {
    // Dispatcher itself must never throw
    console.warn(`[notifications:dispatcher] Error:`, (err as Error).message);
  }
}
