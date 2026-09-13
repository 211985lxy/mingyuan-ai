import { createHash } from "node:crypto";

// Active: all non-terminal states (used for concurrency check, settlement where clause)
export const ACTIVE_VIDEO_TASK_STATUSES = ["queued", "pending", "processing"] as const;
// In-flight: tasks that have acquired a Shanjian slot (used for semaphore calibration)
export const IN_FLIGHT_VIDEO_TASK_STATUSES = ["pending", "processing"] as const;
// Queued: waiting for a slot
export const QUEUED_VIDEO_TASK_STATUSES = ["queued"] as const;
export const TERMINAL_VIDEO_TASK_STATUSES = ["completed", "failed"] as const;
export const VIDEO_TASK_DELIVERY_STATUSES = [
  "pending",
  "durable",
  "degraded",
] as const;

export type ActiveVideoTaskStatus =
  (typeof ACTIVE_VIDEO_TASK_STATUSES)[number];
export type InFlightVideoTaskStatus =
  (typeof IN_FLIGHT_VIDEO_TASK_STATUSES)[number];
export type TerminalVideoTaskStatus =
  (typeof TERMINAL_VIDEO_TASK_STATUSES)[number];
export type VideoTaskDeliveryStatus =
  (typeof VIDEO_TASK_DELIVERY_STATUSES)[number];

export type VideoTaskDeliverySnapshot = {
  deliveryStatus: VideoTaskDeliveryStatus;
  deliveryWarning: string | null;
  deliveryExpiresAt: Date | null;
};

export function isActiveVideoTaskStatus(status: string): boolean {
  return (ACTIVE_VIDEO_TASK_STATUSES as readonly string[]).includes(status);
}

export function isInFlightVideoTaskStatus(status: string): boolean {
  return (IN_FLIGHT_VIDEO_TASK_STATUSES as readonly string[]).includes(status);
}

export function isTerminalVideoTaskStatus(status: string): boolean {
  return (TERMINAL_VIDEO_TASK_STATUSES as readonly string[]).includes(status);
}

export function buildVideoTaskIdempotencyKey(input: {
  userId: string;
  projectId: string | null;
  aimGenerationId?: string | null;
  avatarId: string | null;
  scriptContent: string;
  aspectRatio: "9:16" | "16:9";
  provider: "chanjing" | "shanjian";
  actionId?: string | null;
  voiceSource?: string | null;
}): string {
  const canonical = JSON.stringify({
    userId: input.userId,
    projectId: input.projectId,
    aimGenerationId: input.aimGenerationId ?? null,
    avatarId: input.avatarId,
    scriptContent: input.scriptContent.replace(/\s+/g, " ").trim(),
    aspectRatio: input.aspectRatio,
    provider: input.provider,
    actionId: input.actionId ?? null,
    voiceSource: input.voiceSource ?? "tts",
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildPendingDeliverySnapshot(): VideoTaskDeliverySnapshot {
  return {
    deliveryStatus: "pending",
    deliveryWarning: null,
    deliveryExpiresAt: null,
  };
}

export function buildDurableDeliverySnapshot(): VideoTaskDeliverySnapshot {
  return {
    deliveryStatus: "durable",
    deliveryWarning: null,
    deliveryExpiresAt: null,
  };
}

export function buildDegradedDeliverySnapshot(input: {
  warning: string;
  expiresAt?: Date | null;
}): VideoTaskDeliverySnapshot {
  return {
    deliveryStatus: "degraded",
    deliveryWarning: input.warning,
    deliveryExpiresAt: input.expiresAt ?? null,
  };
}
