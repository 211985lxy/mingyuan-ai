import {
  pollStaleAvatars,
  repairAvatarDemos,
  repairAvatarVoices,
} from "@/lib/task-recovery/avatar-polling";
import type {
  EnhancementRecoverySummary,
  TaskRecoveryInput,
  TaskRecoverySummary,
  TaskRecoveryTrigger,
} from "@/lib/task-recovery/contracts";
import { pollPendingDemos } from "@/lib/task-recovery/demo-polling";
import { runEnhancementRecoveryPass as runEnhancementRecovery } from "@/lib/task-recovery/enhancement-recovery";
import { consumeQueuedTasks } from "@/lib/task-recovery/queue";
import { loadTaskRecoveryCandidates } from "@/lib/task-recovery/queries";
import {
  expireOrphanedPendingTasks,
  pollStaleVideos,
} from "@/lib/task-recovery/video-polling";
import { pollStaleVoiceAssets } from "@/lib/task-recovery/voice-polling";
import { expireZombieTasks } from "@/lib/task-recovery/zombie-expiry";

export type {
  EnhancementRecoverySummary,
  TaskRecoverySummary,
  TaskRecoveryTrigger,
};

export async function runTaskRecoveryPass(
  input: TaskRecoveryInput,
): Promise<TaskRecoverySummary> {
  const now = input.now ?? new Date();
  const logPrefix = `[task-recovery:${input.trigger}]`;
  const candidates = await loadTaskRecoveryCandidates(now);
  const [
    staleAvatars,
    staleVideoTasks,
    orphanedPendingVideoTasks,
    staleVoiceAssets,
    pendingVoiceAvatars,
    missingDemoAvatars,
    pendingDemoAvatars,
  ] = candidates;

  const avatars = await pollStaleAvatars(staleAvatars, logPrefix);
  const voiceRepairs = await repairAvatarVoices(pendingVoiceAvatars, logPrefix);
  const demoRepairs = await repairAvatarDemos(missingDemoAvatars, logPrefix);
  const videos = await pollStaleVideos(staleVideoTasks, logPrefix);
  const orphanedPendingExpired = await expireOrphanedPendingTasks(orphanedPendingVideoTasks, logPrefix);
  const voices = await pollStaleVoiceAssets(staleVoiceAssets, logPrefix);
  const demos = await pollPendingDemos(pendingDemoAvatars, logPrefix);

  await expireZombieTasks(now, logPrefix);
  const queueConsumed = await consumeQueuedTasks(logPrefix);
  if (queueConsumed > 0) console.log(`${logPrefix} Consumed ${queueConsumed} queued task(s) from queue`);

  return { avatars, videos, voices, voiceRepairs, demoRepairs, demos, orphanedPendingExpired };
}

export async function runEnhancementRecoveryPass(
  input: TaskRecoveryInput,
): Promise<EnhancementRecoverySummary> {
  return runEnhancementRecovery(input);
}
