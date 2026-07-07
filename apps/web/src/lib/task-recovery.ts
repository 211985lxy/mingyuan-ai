import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { transferFromUrl } from "@/lib/oss";
import { getTaskInfo } from "@/lib/shanjian";
import { triggerAvatarDemoVideo } from "@/lib/avatar-demo";
import {
  settleVideoTaskFailure,
  settleVideoTaskSuccess,
  compensateVideoTaskSubmissionFailure,
  finalizeAcceptedVideoTaskSubmission,
} from "@/lib/video-task-settlement";
import {
  ensureAvatarVoiceAsset,
  createAvatarVoiceCloneAsset,
  createAvatarVoiceCloneAssetFromVideo,
} from "@/lib/avatar-voice-assets";
import {
  acquireSlot,
  calibrateSemaphore,
  getSlotUsage,
  releaseSlot,
} from "@/lib/shanjian-semaphore";
import { submitToShanjian } from "@/lib/shanjian-submit";
import { getEnhancementJobResult } from "@/lib/aliyun-enhancement";
import {
  triggerVideoEnhancement,
  settleEnhancementSuccess,
  settleEnhancementFailure,
} from "@/lib/video-task-enhancement";
import { isManagedOssUrl } from "@/lib/oss";

const AVATAR_POLL_DELAY_MS = 2 * 60 * 1000;
const VIDEO_POLL_DELAY_MS = 2 * 60 * 1000;
const VOICE_POLL_DELAY_MS = 2 * 60 * 1000;
const CRON_LOCK_TTL_SECONDS = 55;
// Pending tasks that have no externalTaskId after this window had their
// Shanjian submission fail without compensation. Expire them as failed.
const PENDING_SUBMISSION_TIMEOUT_MS = 5 * 60 * 1000;

// Zombie timeouts
const PROCESSING_ZOMBIE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const AVATAR_CLONE_ZOMBIE_TIMEOUT_MS = 60 * 60 * 1000;   // 1 hour
const QUEUED_ZOMBIE_TIMEOUT_MS = 30 * 60 * 1000;          // 30 minutes
const ENHANCEMENT_ZOMBIE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const ENHANCEMENT_POLL_DELAY_MS = 2 * 60 * 1000; // 2 minutes

export type TaskRecoveryTrigger = "cron" | "worker";

export type TaskRecoverySummary = {
  avatars: number;
  videos: number;
  voices: number;
  voiceRepairs: number;
  demoRepairs: number;
  demos: number;
  orphanedPendingExpired: number;
};

/**
 * Consume queued video tasks when Shanjian slots become available.
 * Called each recovery pass after calibration.
 */
async function consumeQueuedTasks(logPrefix: string): Promise<number> {
  await calibrateSemaphore();

  const usage = await getSlotUsage()
  const MAX = parseInt(process.env.SHANJIAN_MAX_CONCURRENT ?? "8", 10)
  const available = MAX - usage
  if (available <= 0) return 0

  const tasks = await prisma.videoTask.findMany({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
    take: available,
  })

  let submitted = 0
  for (const task of tasks) {
    const slot = await acquireSlot()
    if (!slot) break

    try {
      // Optimistic-lock update: only succeeds if task is still queued
      const promoted = await prisma.videoTask.updateMany({
        where: { id: task.id, status: "queued" },
        data: { status: "pending" },
      })

      if (promoted.count === 0) {
        // Another worker already consumed this task
        await releaseSlot()
        continue
      }

      const payload = task.shanjianPayload as Record<string, unknown>
      if (!payload?.videoType) {
        throw new Error("Missing shanjianPayload.videoType for queued task")
      }

      const result = await submitToShanjian(
        payload.videoType as string,
        payload,
      )

      await finalizeAcceptedVideoTaskSubmission({
        taskId: task.id,
        externalTaskId: result.taskId,
        productionPlanId: task.productionPlanId,
        shanjianPayload: result.payload,
      })

      submitted++
      console.log(`${logPrefix} Submitted queued task ${task.id}, externalTaskId=${result.taskId}`)
    } catch (error) {
      console.error(`${logPrefix} Failed to submit queued task ${task.id}:`, error)
      // compensate will call settleVideoTaskFailure which calls releaseSlot if task is pending
      await compensateVideoTaskSubmissionFailure({
        taskId: task.id,
        errorMessage: error instanceof Error ? error.message : "队列提交失败，请重试",
      })
    }
  }

  return submitted
}

/**
 * Expire tasks that have been stuck in processing/queued/cloning beyond their timeouts.
 */
async function expireZombieTasks(now: Date, logPrefix: string): Promise<void> {
  // Expire processing video tasks stuck > 2 hours
  const zombieVideos = await prisma.videoTask.findMany({
    where: {
      status: "processing",
      updatedAt: { lt: new Date(now.getTime() - PROCESSING_ZOMBIE_TIMEOUT_MS) },
    },
    take: 20,
  })
  for (const task of zombieVideos) {
    try {
      await settleVideoTaskFailure({
        taskId: task.id,
        errorCode: "PROCESSING_TIMEOUT",
        errorMessage: "视频生成超时（超过 2 小时），请重试",
        source: "recovery",
      })
      console.warn(`${logPrefix} Expired zombie processing task ${task.id}`)
    } catch (error) {
      console.error(`${logPrefix} Failed to expire zombie processing task ${task.id}:`, error)
    }
  }

  // Expire queued tasks stuck > 30 minutes
  const zombieQueued = await prisma.videoTask.findMany({
    where: {
      status: "queued",
      createdAt: { lt: new Date(now.getTime() - QUEUED_ZOMBIE_TIMEOUT_MS) },
    },
    take: 20,
  })
  for (const task of zombieQueued) {
    try {
      await settleVideoTaskFailure({
        taskId: task.id,
        errorCode: "QUEUED_TIMEOUT",
        errorMessage: "排队超时（超过 30 分钟），请重新提交",
        source: "recovery",
        releasePlanReservation: true,
      })
      console.warn(`${logPrefix} Expired zombie queued task ${task.id}`)
    } catch (error) {
      console.error(`${logPrefix} Failed to expire zombie queued task ${task.id}:`, error)
    }
  }

  // Expire avatar cloning stuck > 1 hour (avatar uses manual releaseSlot since it has no settle fn)
  const zombieAvatars = await prisma.avatar.findMany({
    where: {
      status: "cloning",
      updatedAt: { lt: new Date(now.getTime() - AVATAR_CLONE_ZOMBIE_TIMEOUT_MS) },
    },
    take: 20,
  })
  for (const avatar of zombieAvatars) {
    try {
      const updated = await prisma.avatar.updateMany({
        where: { id: avatar.id, status: "cloning" },
        data: {
          status: "failed",
          errorCode: "CLONING_TIMEOUT",
          errorMessage: "数字人克隆超时，请重试",
        },
      })
      if (updated.count > 0) {
        await releaseSlot()
      }
      console.warn(`${logPrefix} Expired zombie cloning avatar ${avatar.id}`)
    } catch (error) {
      console.error(`${logPrefix} Failed to expire zombie cloning avatar ${avatar.id}:`, error)
    }
  }
}

export async function runTaskRecoveryPass(input: {
  trigger: TaskRecoveryTrigger;
  now?: Date;
}): Promise<TaskRecoverySummary> {
  const now = input.now ?? new Date();
  const logPrefix = `[task-recovery:${input.trigger}]`;

  const [
    staleAvatars,
    staleVideoTasks,
    orphanedPendingVideoTasks,
    staleVoiceAssets,
    pendingVoiceAvatars,
    missingDemoAvatars,
    pendingDemoAvatars,
  ] = await Promise.all([
    prisma.avatar.findMany({
      where: {
        status: "cloning",
        updatedAt: { lt: new Date(now.getTime() - AVATAR_POLL_DELAY_MS) },
      },
      take: 50,
    }),
    prisma.videoTask.findMany({
      where: {
        status: "processing",
        updatedAt: { lt: new Date(now.getTime() - VIDEO_POLL_DELAY_MS) },
      },
      take: 50,
    }),
    // Pending tasks with no externalTaskId that are older than the timeout window
    // had their Shanjian submission fail without the compensation path running.
    // Expire them as failed so they do not stay stuck in 排队中 indefinitely.
    prisma.videoTask.findMany({
      where: {
        status: "pending",
        externalTaskId: null,
        createdAt: { lt: new Date(now.getTime() - PENDING_SUBMISSION_TIMEOUT_MS) },
      },
      take: 50,
    }),
    prisma.asset.findMany({
      where: {
        assetType: "voice",
        status: "processing",
        updatedAt: { lt: new Date(now.getTime() - VOICE_POLL_DELAY_MS) },
      },
      take: 50,
    }),
    prisma.avatar.findMany({
      where: {
        status: "ready",
        externalVirtualmanId: { not: null },
        externalSpeakerId: null,
        sourceVideoUrl: { not: null },
      },
      take: 20,
    }),
    prisma.avatar.findMany({
      where: {
        status: "ready",
        externalVirtualmanId: { not: null },
        externalSpeakerId: { not: null },
        demoTaskId: null,
        demoVideoUrl: null,
      },
      take: 20,
    }),
    prisma.avatar.findMany({
      where: {
        demoTaskId: { not: null },
        demoVideoUrl: null,
        status: "ready",
      },
      take: 20,
    }),
  ]);

  let avatarsPolled = 0;
  let videosPolled = 0;
  let voicesPolled = 0;
  let voiceRepairs = 0;
  let demoRepairs = 0;
  let demosPolled = 0;
  let orphanedPendingExpired = 0;

  for (const avatar of staleAvatars) {
    if (!avatar.externalTaskId) continue;

    const locked = await acquireTaskRecoveryLock(`poll:${avatar.externalTaskId}`);
    if (!locked) continue;

    try {
      const taskResult = await getTaskInfo(avatar.externalTaskId);

      if (taskResult.status === "succeed") {
        if (!taskResult.result?.virtualmanId) {
          await prisma.avatar.updateMany({
            where: { id: avatar.id, status: "cloning" },
            data: {
              status: "failed",
              errorCode: "MISSING_VIRTUALMAN_ID",
              errorMessage: "克隆完成但未返回数字人 ID，请重新克隆",
            },
          });
          continue;
        }

        let ossCoverUrl: string | undefined;
        if (taskResult.result?.coverUrl) {
          ossCoverUrl = await transferFromUrl(
            taskResult.result.coverUrl,
            `avatars/${avatar.id}/cover.jpg`,
          );
        }

        const speakerName = `${avatar.name}的声音`;

        const updated = await prisma.avatar.updateMany({
          where: { id: avatar.id, status: "cloning" },
          data: {
            status: "ready",
            externalVirtualmanId: taskResult.result.virtualmanId,
            externalSpeakerId: taskResult.result?.speakerId ?? null,
            coverUrl: ossCoverUrl ?? null,
            speakerName,
          },
        });

        if (updated.count === 0) {
          continue;
        }

        if (taskResult.result?.speakerId) {
          await ensureAvatarVoiceAsset({
            userId: avatar.userId,
            avatarName: avatar.name,
            speakerId: taskResult.result.speakerId,
            speakerName,
            sourceAvatarId: avatar.id,
            sourceVideoUrl: avatar.sourceVideoUrl,
            demoAudioUrl: taskResult.result.demoAudioUrl,
          });
        } else if (taskResult.result?.audioUrl) {
          await createAvatarVoiceCloneAsset({
            userId: avatar.userId,
            avatarName: avatar.name,
            speakerName,
            sourceAvatarId: avatar.id,
            audioUrl: taskResult.result.audioUrl,
            sourceVideoUrl: avatar.sourceVideoUrl,
          });
        } else if (avatar.sourceVideoUrl) {
          await createAvatarVoiceCloneAssetFromVideo({
            userId: avatar.userId,
            avatarId: avatar.id,
            avatarName: avatar.name,
            speakerName,
            sourceVideoUrl: avatar.sourceVideoUrl,
          });
        }

        if (taskResult.result?.speakerId) {
          triggerAvatarDemoVideo({
            avatarId: avatar.id,
            virtualmanId: taskResult.result.virtualmanId,
            speakerId: taskResult.result.speakerId,
            logPrefix,
          }).catch((error) =>
            console.error(
              `${logPrefix} Demo video trigger failed for avatar ${avatar.id}:`,
              error,
            ),
          );
        }
      } else if (taskResult.status === "failed") {
        await prisma.avatar.updateMany({
          where: { id: avatar.id, status: "cloning" },
          data: {
            status: "failed",
            errorCode: taskResult.errorCode ?? null,
            errorMessage: taskResult.errorMessage ?? null,
          },
        });
      }

      avatarsPolled++;
    } catch (error) {
      console.error(`${logPrefix} Failed to poll avatar ${avatar.id}:`, error);
    }
  }

  for (const avatar of pendingVoiceAvatars) {
    try {
      const locked = await acquireTaskRecoveryLock(`repair:voice:${avatar.id}`);
      if (!locked) continue;

      const attempted = await createAvatarVoiceCloneAssetFromVideo({
        userId: avatar.userId,
        avatarId: avatar.id,
        avatarName: avatar.name,
        speakerName: avatar.speakerName || `${avatar.name}的声音`,
        sourceVideoUrl: avatar.sourceVideoUrl,
      });

      if (attempted) {
        voiceRepairs++;
      }
    } catch (error) {
      console.error(
        `${logPrefix} Failed to repair voice for avatar ${avatar.id}:`,
        error,
      );
    }
  }

  for (const avatar of missingDemoAvatars) {
    try {
      const locked = await acquireTaskRecoveryLock(`repair:demo:${avatar.id}`);
      if (!locked) continue;

      const triggered = await triggerAvatarDemoVideo({
        avatarId: avatar.id,
        virtualmanId: avatar.externalVirtualmanId!,
        speakerId: avatar.externalSpeakerId,
        logPrefix,
      });

      if (triggered) {
        demoRepairs++;
      }
    } catch (error) {
      console.error(
        `${logPrefix} Failed to repair demo video for avatar ${avatar.id}:`,
        error,
      );
    }
  }

  for (const videoTask of staleVideoTasks) {
    if (!videoTask.externalTaskId) continue;

    const locked = await acquireTaskRecoveryLock(`poll:${videoTask.externalTaskId}`);
    if (!locked) continue;

    try {
      const taskResult = await getTaskInfo(videoTask.externalTaskId);

      if (taskResult.status === "succeed") {
        if (!taskResult.result?.videoUrl) {
          console.warn(
            `${logPrefix} Video task ${videoTask.id} succeed but no videoUrl; skipping`,
          );
          videosPolled++;
          continue;
        }

        await settleVideoTaskSuccess({
          taskId: videoTask.id,
          result: {
            videoUrl: taskResult.result.videoUrl,
            coverUrl: taskResult.result.coverUrl,
            duration: taskResult.result.duration,
          },
          source: "recovery",
        });
      } else if (taskResult.status === "failed") {
        await settleVideoTaskFailure({
          taskId: videoTask.id,
          errorCode: taskResult.errorCode ?? null,
          errorMessage: taskResult.errorMessage ?? null,
          source: "recovery",
        });
      }

      videosPolled++;
    } catch (error) {
      console.error(
        `${logPrefix} Failed to poll video task ${videoTask.id}:`,
        error,
      );
    }
  }

  // Expire pending tasks that never received an externalTaskId.
  // These tasks had their Shanjian submission fail without the compensation
  // path running (e.g. an infrastructure error at reservation time). Without
  // this pass they remain stuck in "pending" (排队中) indefinitely.
  for (const videoTask of orphanedPendingVideoTasks) {
    const locked = await acquireTaskRecoveryLock(`expire-pending:${videoTask.id}`);
    if (!locked) continue;

    try {
      await settleVideoTaskFailure({
        taskId: videoTask.id,
        errorCode: "TASK_SUBMISSION_FAILED",
        errorMessage: "任务已预留，但提交到视频服务时失败，请重试。",
        source: "recovery",
        releasePlanReservation: true,
      });

      console.warn(
        `${logPrefix} Expired orphaned pending video task ${videoTask.id} (no externalTaskId after timeout)`,
      );

      orphanedPendingExpired++;
    } catch (error) {
      console.error(
        `${logPrefix} Failed to expire orphaned pending task ${videoTask.id}:`,
        error,
      );
    }
  }

  for (const asset of staleVoiceAssets) {
    if (!asset.externalTaskId) continue;

    const locked = await acquireTaskRecoveryLock(`poll:${asset.externalTaskId}`);
    if (!locked) continue;

    try {
      const taskResult = await getTaskInfo(asset.externalTaskId);

      if (taskResult.status === "succeed") {
        const updated = await prisma.asset.updateMany({
          where: { id: asset.id, status: "processing" },
          data: {
            status: "ready",
            externalSpeakerId: taskResult.result?.speakerId ?? null,
            demoAudioUrl: taskResult.result?.demoAudioUrl ?? null,
            errorCode: null,
            errorMessage: null,
          },
        });

        if (
          updated.count > 0 &&
          taskResult.result?.speakerId &&
          asset.sourceAvatarId
        ) {
          const avatar = await prisma.avatar.findUnique({
            where: { id: asset.sourceAvatarId },
            select: {
              externalSpeakerId: true,
              externalVirtualmanId: true,
              demoTaskId: true,
              speakerName: true,
            },
          });

          if (avatar) {
            if (!avatar.externalSpeakerId) {
              await prisma.avatar.update({
                where: { id: asset.sourceAvatarId },
                data: {
                  externalSpeakerId: taskResult.result.speakerId,
                  speakerName: avatar.speakerName || asset.name,
                },
              });
            }

            const resolvedSpeakerId =
              avatar.externalSpeakerId || taskResult.result.speakerId;

            if (avatar.externalVirtualmanId && !avatar.demoTaskId) {
              await triggerAvatarDemoVideo({
                avatarId: asset.sourceAvatarId,
                virtualmanId: avatar.externalVirtualmanId,
                speakerId: resolvedSpeakerId,
                logPrefix,
              });
            }
          }
        }
      } else if (taskResult.status === "failed") {
        await prisma.asset.updateMany({
          where: { id: asset.id, status: "processing" },
          data: {
            status: "failed",
            externalTaskId: null,
            errorCode: taskResult.errorCode ?? null,
            errorMessage: taskResult.errorMessage ?? null,
          },
        });
      }

      voicesPolled++;
    } catch (error) {
      console.error(`${logPrefix} Failed to poll voice asset ${asset.id}:`, error);
    }
  }

  for (const avatar of pendingDemoAvatars) {
    if (!avatar.demoTaskId) continue;

    const locked = await acquireTaskRecoveryLock(`poll:${avatar.demoTaskId}`);
    if (!locked) continue;

    try {
      const taskResult = await getTaskInfo(avatar.demoTaskId);

      if (taskResult.status === "succeed") {
        let ossVideoUrl: string | undefined;
        let ossCoverUrl: string | undefined;

        if (taskResult.result?.videoUrl) {
          ossVideoUrl = await transferFromUrl(
            taskResult.result.videoUrl,
            `avatars/${avatar.id}/demo.mp4`,
          );
        }
        if (taskResult.result?.coverUrl) {
          ossCoverUrl = await transferFromUrl(
            taskResult.result.coverUrl,
            `avatars/${avatar.id}/demo-cover.jpg`,
          );
        }

        await prisma.avatar.update({
          where: { id: avatar.id },
          data: {
            demoVideoUrl: ossVideoUrl ?? null,
            ...(ossCoverUrl ? { coverUrl: ossCoverUrl } : {}),
          },
        });
      } else if (taskResult.status === "failed") {
        await prisma.avatar.update({
          where: { id: avatar.id },
          data: { demoTaskId: null },
        });
        console.warn(
          `${logPrefix} Demo video failed for avatar ${avatar.id}: ${taskResult.errorCode} ${taskResult.errorMessage}`,
        );
      }

      demosPolled++;
    } catch (error) {
      console.error(
        `${logPrefix} Failed to poll demo video for avatar ${avatar.id}:`,
        error,
      );
    }
  }

  // Expire zombie tasks (stuck processing/queued/cloning beyond timeout)
  await expireZombieTasks(now, logPrefix);

  // Consume queued tasks when slots are available (includes calibration)
  const queueConsumed = await consumeQueuedTasks(logPrefix);
  if (queueConsumed > 0) {
    console.log(`${logPrefix} Consumed ${queueConsumed} queued task(s) from queue`);
  }

  return {
    avatars: avatarsPolled,
    videos: videosPolled,
    voices: voicesPolled,
    voiceRepairs,
    demoRepairs,
    demos: demosPolled,
    orphanedPendingExpired,
  };
}

export type EnhancementRecoverySummary = {
  enhancementsPolled: number;
  enhancementsSettled: number;
  zombiesExpired: number;
  backfillTriggered: number;
};

export async function runEnhancementRecoveryPass(input: {
  trigger: TaskRecoveryTrigger;
  now?: Date;
}): Promise<EnhancementRecoverySummary> {
  const now = input.now ?? new Date();
  const logPrefix = `[enhancement-recovery:${input.trigger}]`;

  let enhancementsPolled = 0;
  let enhancementsSettled = 0;
  let zombiesExpired = 0;
  let backfillTriggered = 0;

  // 1. Poll stale enhancement jobs (processing for >2 minutes with a jobId)
  const staleEnhancements = await prisma.videoTask.findMany({
    where: {
      enhancementStatus: "processing",
      enhancementJobId: { not: null },
      updatedAt: { lt: new Date(now.getTime() - ENHANCEMENT_POLL_DELAY_MS) },
    },
    take: 50,
  });

  for (const task of staleEnhancements) {
    const locked = await acquireTaskRecoveryLock(
      `poll:enhancement:${task.enhancementJobId}`,
    );
    if (!locked) continue;

    try {
      const result = await getEnhancementJobResult(task.enhancementJobId!);

      if (result.status === "PROCESS_SUCCESS") {
        if (!result.videoUrl) {
          await settleEnhancementFailure({
            taskId: task.id,
            errorCode: "MISSING_VIDEO_URL",
            errorMessage:
              "Enhancement completed but no video URL returned from API",
          });
          enhancementsSettled++;
          continue;
        }

        await settleEnhancementSuccess({
          taskId: task.id,
          temporaryVideoUrl: result.videoUrl,
        });
        enhancementsSettled++;
        console.log(
          `${logPrefix} Settled enhancement success for task ${task.id}`,
        );
      } else if (result.status === "PROCESS_FAIL") {
        await settleEnhancementFailure({
          taskId: task.id,
          errorCode: result.errorCode ?? "ENHANCEMENT_FAILED",
          errorMessage:
            result.errorMessage ?? "Enhancement processing failed",
        });
        enhancementsSettled++;
        console.log(
          `${logPrefix} Settled enhancement failure for task ${task.id}`,
        );
      }
      // else still PROCESSING — check again next cycle

      enhancementsPolled++;
    } catch (error) {
      console.error(
        `${logPrefix} Failed to poll enhancement for task ${task.id}:`,
        error,
      );
    }
  }

  // 2. Expire zombie enhancement jobs (stuck in processing >2 hours)
  const zombieEnhancements = await prisma.videoTask.findMany({
    where: {
      enhancementStatus: "processing",
      enhancementStartedAt: {
        lt: new Date(now.getTime() - ENHANCEMENT_ZOMBIE_TIMEOUT_MS),
      },
    },
    take: 20,
  });

  for (const task of zombieEnhancements) {
    try {
      await settleEnhancementFailure({
        taskId: task.id,
        errorCode: "ENHANCEMENT_TIMEOUT",
        errorMessage: "4K enhancement processing timeout (>2 hours)",
      });
      zombiesExpired++;
      console.warn(
        `${logPrefix} Expired zombie enhancement for task ${task.id}`,
      );
    } catch (error) {
      console.error(
        `${logPrefix} Failed to expire zombie enhancement for task ${task.id}:`,
        error,
      );
    }
  }

  // 3. Retry TRANSFER_FAILED: re-query Aliyun for the result and retry the OSS transfer.
  // These tasks had successful Aliyun processing but the temporary URL expired or
  // the OSS upload failed. Re-querying may yield a fresh temporary URL.
  const transferFailedTasks = await prisma.videoTask.findMany({
    where: {
      enhancementStatus: "failed",
      enhancementErrorCode: "TRANSFER_FAILED",
      enhancementJobId: { not: null },
    },
    take: 5,
  });

  for (const task of transferFailedTasks) {
    const locked = await acquireTaskRecoveryLock(
      `retry:enhancement:${task.enhancementJobId}`,
    );
    if (!locked) continue;

    try {
      const result = await getEnhancementJobResult(task.enhancementJobId!);

      if (result.status === "PROCESS_SUCCESS" && result.videoUrl) {
        // Reset to processing so settleEnhancementSuccess can transfer
        await prisma.videoTask.update({
          where: { id: task.id },
          data: {
            enhancementStatus: "processing",
            enhancementErrorCode: null,
            enhancementErrorMessage: null,
            enhancementCompletedAt: null,
          },
        });

        await settleEnhancementSuccess({
          taskId: task.id,
          temporaryVideoUrl: result.videoUrl,
        });
        enhancementsSettled++;
        console.log(
          `${logPrefix} Retried TRANSFER_FAILED enhancement for task ${task.id} — success`,
        );
      } else {
        console.log(
          `${logPrefix} Retry for TRANSFER_FAILED task ${task.id}: Aliyun status=${result.status}, no fresh URL available`,
        );
      }
    } catch (error) {
      console.error(
        `${logPrefix} Failed to retry TRANSFER_FAILED enhancement for task ${task.id}:`,
        error,
      );
    }
  }

  // 4. Backfill: trigger enhancement for completed+durable tasks that were never enhanced.
  // These tasks were completed before the enhancement trigger was deployed.
  const unenhancedTasks = await prisma.videoTask.findMany({
    where: {
      status: "completed",
      deliveryStatus: "durable",
      enhancementStatus: null,
      videoUrl: { not: null },
    },
    select: { id: true, videoUrl: true },
    take: 5, // throttle to avoid overwhelming the Aliyun API
  });

  for (const task of unenhancedTasks) {
    if (!task.videoUrl || !isManagedOssUrl(task.videoUrl)) continue;

    const locked = await acquireTaskRecoveryLock(`backfill:enhancement:${task.id}`);
    if (!locked) continue;

    try {
      await triggerVideoEnhancement({
        taskId: task.id,
        sourceVideoUrl: task.videoUrl,
      });
      backfillTriggered++;
      console.log(`${logPrefix} Backfill triggered enhancement for task ${task.id}`);
    } catch (error) {
      console.error(
        `${logPrefix} Failed to backfill enhancement for task ${task.id}:`,
        error,
      );
    }
  }

  return {
    enhancementsPolled,
    enhancementsSettled,
    zombiesExpired,
    backfillTriggered,
  };
}

async function acquireTaskRecoveryLock(lockKey: string): Promise<boolean> {
  try {
    const set = await redis.set(
      lockKey,
      "1",
      "EX",
      CRON_LOCK_TTL_SECONDS,
      "NX",
    );
    return !!set;
  } catch (error) {
    // fail-closed:Redis 故障时不再"默认拿到锁",否则多副本并发会触发
    // 重复的山见计费、重复 OSS 转存、重复数字人 demo 生成。
    // 本轮跳过,等下一轮重试。
    console.error(
      "[task-recovery] acquireTaskRecoveryLock 失败,本轮跳过(避免重复处理):",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
