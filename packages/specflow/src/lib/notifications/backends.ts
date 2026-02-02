/**
 * Notification Backends
 * Voice, desktop, webhook, and terminal-block delivery channels
 * All backends are fire-and-forget — they never throw
 */

import type { NotificationPayload } from "../../types";

/**
 * Send voice notification via PAI voice server
 */
export async function sendVoice(payload: NotificationPayload): Promise<void> {
  try {
    const message = `Phase ${payload.phase} ${payload.transition} for ${payload.featureId}`;
    await fetch("http://localhost:8888/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        voice_id: "gJx1vCzNCD1EQHT212Ls",
        title: "SpecFlow",
      }),
      signal: AbortSignal.timeout(2000),
    });
  } catch (err) {
    console.warn(`[notifications:voice] Delivery failed:`, (err as Error).message);
  }
}

/**
 * Send macOS desktop notification via osascript
 */
export async function sendDesktop(payload: NotificationPayload): Promise<void> {
  if (process.platform !== "darwin") return;

  try {
    const title = `SpecFlow: ${payload.featureId}`;
    const message = `Phase ${payload.phase} ${payload.transition}`;
    const proc = Bun.spawn([
      "osascript", "-e",
      `display notification "${message}" with title "${title}" sound name "Glass"`,
    ]);
    await proc.exited;
  } catch (err) {
    console.warn(`[notifications:desktop] Delivery failed:`, (err as Error).message);
  }
}

/**
 * Send webhook POST with notification payload
 */
export async function sendWebhook(payload: NotificationPayload, webhookUrl: string): Promise<void> {
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`[notifications:webhook] Delivery failed:`, (err as Error).message);
  }
}

/**
 * Block terminal with acknowledgment prompt (CRITICAL tier only)
 */
export async function sendTerminalBlock(payload: NotificationPayload): Promise<void> {
  if (!process.stdin.isTTY) return;

  try {
    const readline = await import("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    await new Promise<void>((resolve) => {
      rl.question(
        `\n\u26A0\uFE0F  CRITICAL: Phase ${payload.phase} ${payload.transition} for ${payload.featureId}\n   Press Enter to acknowledge and continue...`,
        () => {
          rl.close();
          resolve();
        }
      );
    });
  } catch (err) {
    console.warn(`[notifications:terminal-block] Failed:`, (err as Error).message);
  }
}
