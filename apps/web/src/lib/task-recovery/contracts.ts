export const AVATAR_POLL_DELAY_MS = 2 * 60 * 1000;
export const VIDEO_POLL_DELAY_MS = 2 * 60 * 1000;
export const VOICE_POLL_DELAY_MS = 2 * 60 * 1000;
export const PENDING_SUBMISSION_TIMEOUT_MS = 5 * 60 * 1000;
export const PROCESSING_ZOMBIE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const AVATAR_CLONE_ZOMBIE_TIMEOUT_MS = 60 * 60 * 1000;
export const QUEUED_ZOMBIE_TIMEOUT_MS = 30 * 60 * 1000;
export const ENHANCEMENT_ZOMBIE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const ENHANCEMENT_POLL_DELAY_MS = 2 * 60 * 1000;

export type TaskRecoveryTrigger = "cron" | "worker";

export type TaskRecoveryInput = {
  trigger: TaskRecoveryTrigger;
  now?: Date;
};

export type TaskRecoverySummary = {
  avatars: number;
  videos: number;
  voices: number;
  voiceRepairs: number;
  demoRepairs: number;
  demos: number;
  orphanedPendingExpired: number;
};

export type EnhancementRecoverySummary = {
  enhancementsPolled: number;
  enhancementsSettled: number;
  zombiesExpired: number;
  backfillTriggered: number;
};
