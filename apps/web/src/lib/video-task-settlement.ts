import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import {
  isManagedOssUrl,
  persistVideoThumbnail,
  transferFromUrlDetailed,
} from "@/lib/oss";
import {
  ACTIVE_VIDEO_TASK_STATUSES,
  buildDegradedDeliverySnapshot,
  buildDurableDeliverySnapshot,
  buildPendingDeliverySnapshot,
  isTerminalVideoTaskStatus,
} from "@/lib/video-task-domain";
import { releaseSlot } from "@/lib/shanjian-semaphore";
import { triggerVideoEnhancement } from "@/lib/video-task-enhancement";

type VideoTaskRecord = Awaited<ReturnType<typeof prisma.videoTask.findUnique>>;

export type VideoTaskSettlementSource =
  | "webhook"
  | "recovery"
  | "submission_compensation";

type SuccessfulResult = {
  videoUrl?: string;
  coverUrl?: string;
  duration?: number;
};

async function findTask(taskId: string): Promise<VideoTaskRecord> {
  return prisma.videoTask.findUnique({
    where: { id: taskId },
  });
}

async function archiveVideoTaskOutput(input: {
  taskId: string;
  result: SuccessfulResult;
}) {
  const videoTransfer = await transferFromUrlDetailed(
    input.result.videoUrl!,
    `videos/${input.taskId}/video.mp4`,
  );

  if (!videoTransfer.durable) {
    const coverTransfer = input.result.coverUrl
      ? await transferFromUrlDetailed(
          input.result.coverUrl,
          `videos/${input.taskId}/cover.jpg`,
        )
      : null;

    const warning = coverTransfer?.warning
      ? `${videoTransfer.warning} ${coverTransfer.warning}`.trim()
      : videoTransfer.warning ?? "结果已生成，但当前交付不是持久存储。";

    const degraded = buildDegradedDeliverySnapshot({
      warning,
      expiresAt: videoTransfer.expiresAt ?? coverTransfer?.expiresAt ?? null,
    });

    return {
      videoUrl: videoTransfer.url,
      coverUrl: coverTransfer?.url ?? input.result.coverUrl ?? null,
      ...degraded,
    };
  }

  let coverUrl: string | null = null;
  let coverWarning: string | null = null;
  let coverExpiresAt: Date | null = null;

  if (input.result.coverUrl) {
    const coverTransfer = await transferFromUrlDetailed(
      input.result.coverUrl,
      `videos/${input.taskId}/cover.jpg`,
    );
    if (coverTransfer.durable) {
      coverUrl = coverTransfer.url;
    } else {
      coverWarning = coverTransfer.warning ?? "封面转存失败，当前交付不是完整持久存储。";
      coverExpiresAt = coverTransfer.expiresAt;
    }
  }

  if (!coverUrl && isManagedOssUrl(videoTransfer.url)) {
    coverUrl =
      (await persistVideoThumbnail(
        videoTransfer.url,
        `videos/${input.taskId}/cover.jpg`,
      )) ?? null;
  }

  if (coverWarning && !coverUrl) {
    return {
      videoUrl: videoTransfer.url,
      coverUrl: null,
      ...buildDegradedDeliverySnapshot({
        warning: coverWarning,
        expiresAt: coverExpiresAt,
      }),
    };
  }

  return {
    videoUrl: videoTransfer.url,
    coverUrl,
    ...buildDurableDeliverySnapshot(),
  };
}

export async function markVideoTaskSubmitted(input: {
  taskId: string;
  externalTaskId: string;
  productionPlanId?: string | null;
  shanjianPayload?: Record<string, unknown> | null;
}) {
  await prisma.$transaction(async (tx) => {
    const task = await tx.videoTask.findUnique({
      where: { id: input.taskId },
      select: {
        status: true,
        externalTaskId: true,
      },
    });

    if (!task) {
      throw new Error("Task reservation is no longer active");
    }

    if (
      task.externalTaskId
      && task.externalTaskId !== input.externalTaskId
    ) {
      throw new Error("Task reservation is no longer active");
    }

    if (task.externalTaskId !== input.externalTaskId) {
      const updated = await tx.videoTask.updateMany({
        where: {
          id: input.taskId,
          externalTaskId: null,
          status: { in: ["pending", "processing"] },
        },
        data: {
          status: "processing",
          externalTaskId: input.externalTaskId,
          ...(input.shanjianPayload ? { shanjianPayload: input.shanjianPayload as Prisma.InputJsonValue } : {}),
        },
      });

      if (updated.count === 0) {
        throw new Error("Task reservation is no longer active");
      }
    } else if (task.status === "pending") {
      await tx.videoTask.update({
        where: { id: input.taskId },
        data: {
          status: "processing",
          ...(input.shanjianPayload ? { shanjianPayload: input.shanjianPayload as Prisma.InputJsonValue } : {}),
        },
      });
    }

    if (input.productionPlanId) {
      await tx.videoProductionPlan.updateMany({
        where: {
          id: input.productionPlanId,
          status: { in: ["confirmed", "used"] },
        },
        data: {
          status: "used",
        },
      });
    }
  });

  return findTask(input.taskId);
}

export async function finalizeAcceptedVideoTaskSubmission(input: {
  taskId: string;
  externalTaskId: string;
  productionPlanId?: string | null;
  shanjianPayload?: Record<string, unknown> | null;
}) {
  try {
    return await markVideoTaskSubmitted(input);
  } catch (error) {
    const recovered = await findTask(input.taskId);
    if (
      recovered
      && recovered.externalTaskId === input.externalTaskId
      && (recovered.status === "processing"
        || isTerminalVideoTaskStatus(recovered.status))
    ) {
      return recovered;
    }
    throw error;
  }
}

export async function compensateVideoTaskSubmissionFailure(input: {
  taskId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  return settleVideoTaskFailure({
    taskId: input.taskId,
    errorCode: input.errorCode ?? "TASK_SUBMISSION_FAILED",
    errorMessage:
      input.errorMessage ?? "任务已预留，但提交到视频服务时失败，请重试。",
    source: "submission_compensation",
    releasePlanReservation: true,
  });
}

export async function settleVideoTaskFailure(input: {
  taskId: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  source: VideoTaskSettlementSource;
  releasePlanReservation?: boolean;
}) {
  const task = await findTask(input.taskId);
  if (!task) return null;
  if (isTerminalVideoTaskStatus(task.status)) return task;

  const updatedCount = await prisma.$transaction(async (tx) => {
    const updated = await tx.videoTask.updateMany({
      where: {
        id: input.taskId,
        status: { in: [...ACTIVE_VIDEO_TASK_STATUSES] },
      },
      data: {
        status: "failed",
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        deliveryStatus: "pending",
        deliveryWarning: null,
        deliveryExpiresAt: null,
      },
    });

    // Release plan reservation for pending or queued tasks (both held a confirmed plan)
    if (
      input.releasePlanReservation
      && task.productionPlanId
      && (task.status === "pending" || task.status === "queued")
    ) {
      await tx.videoProductionPlan.updateMany({
        where: {
          id: task.productionPlanId,
          status: "confirmed",
        },
        data: {
          status: "draft",
        },
      });
    }

    return updated.count;
  });

  // Only release a Shanjian slot if the task was actually in-flight (pending/processing).
  // Queued tasks never acquired a slot, so releasing would corrupt the semaphore.
  if (updatedCount > 0 && (task.status === "pending" || task.status === "processing")) {
    await releaseSlot();
  }

  return findTask(input.taskId);
}

export async function settleVideoTaskSuccess(input: {
  taskId: string;
  result: SuccessfulResult;
  source: Exclude<VideoTaskSettlementSource, "submission_compensation">;
}) {
  const task = await findTask(input.taskId);
  if (!task) return null;
  if (isTerminalVideoTaskStatus(task.status)) return task;
  if (!input.result.videoUrl) {
    return task;
  }

  const archived = await archiveVideoTaskOutput({
    taskId: input.taskId,
    result: input.result,
  });

  const updated = await prisma.videoTask.updateMany({
    where: {
      id: input.taskId,
      status: { in: [...ACTIVE_VIDEO_TASK_STATUSES] },
    },
    data: {
      status: "completed",
      videoUrl: archived.videoUrl,
      coverUrl: archived.coverUrl,
      duration: input.result.duration ?? null,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      deliveryStatus: archived.deliveryStatus,
      deliveryWarning: archived.deliveryWarning,
      deliveryExpiresAt: archived.deliveryExpiresAt,
    },
  });

  // Release the Shanjian slot only if task was in pending/processing (not queued)
  if (updated.count > 0 && (task.status === "pending" || task.status === "processing")) {
    await releaseSlot();
  }

  // Trigger 4K enhancement if delivery is durable and video is stored in OSS.
  // Fire-and-forget: enhancement failure must NEVER block 1080p delivery.
  // Per ENHANCE-01: auto-trigger after completed+durable.
  // Per ENHANCE-04: catch errors silently — 1080p remains accessible.
  if (archived.deliveryStatus === "durable" && isManagedOssUrl(archived.videoUrl)) {
    triggerVideoEnhancement({
      taskId: input.taskId,
      sourceVideoUrl: archived.videoUrl,
    }).catch((err) => {
      console.error(`[enhancement] Failed to trigger for task ${input.taskId}:`, err);
    });
  }

  return findTask(input.taskId);
}

export function buildReservedVideoTaskDefaults() {
  return buildPendingDeliverySnapshot();
}
