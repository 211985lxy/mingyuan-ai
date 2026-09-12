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
import { releaseProviderSlot, type DigitalHumanProvider } from "@/lib/digital-human-semaphore";
import { digitalHumanEventsTotal } from "@/lib/metrics";

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

function resolveTaskProvider(provider: string | null | undefined): DigitalHumanProvider {
  return provider === "shanjian" ? "shanjian" : "chanjing";
}

async function findTask(taskId: string): Promise<VideoTaskRecord> {
  return prisma.videoTask.findUnique({
    where: { id: taskId },
  });
}

async function archiveVideoTaskOutput(input: {
  taskId: string;
  result: SuccessfulResult;
}) {
  const videoTransfer = isManagedOssUrl(input.result.videoUrl!)
    ? { url: input.result.videoUrl!, durable: true, warning: null, expiresAt: null }
    : await transferFromUrlDetailed(
        input.result.videoUrl!,
        `videos/${input.taskId}/video.mp4`,
      );

  if (!videoTransfer.durable) {
    const coverTransfer = input.result.coverUrl
      ? isManagedOssUrl(input.result.coverUrl)
        ? { url: input.result.coverUrl, durable: true, warning: null, expiresAt: null }
        : await transferFromUrlDetailed(
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
    const coverTransfer = isManagedOssUrl(input.result.coverUrl)
      ? { url: input.result.coverUrl, durable: true, warning: null, expiresAt: null }
      : await transferFromUrlDetailed(
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

  // Release only the provider slot acquired by an in-flight task. Queued tasks
  // never acquired a slot, so releasing would corrupt the provider counter.
  if (updatedCount > 0 && (task.status === "pending" || task.status === "processing")) {
    await releaseProviderSlot(resolveTaskProvider(task.provider));
    digitalHumanEventsTotal.inc({ provider: resolveTaskProvider(task.provider), event: "settlement", status: "failed" });
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

  const provider = resolveTaskProvider(task.provider);
  let archived: Awaited<ReturnType<typeof archiveVideoTaskOutput>>;
  try {
    archived = await archiveVideoTaskOutput({
      taskId: input.taskId,
      result: input.result,
    });
  } catch (error) {
    // The provider has already completed. Preserve its result as a degraded
    // delivery and expose transfer retry instead of creating another provider order.
    digitalHumanEventsTotal.inc({ provider, event: "transfer", status: "failed" });
    const fallback = await prisma.videoTask.updateMany({
      where: {
        id: input.taskId,
        status: { in: [...ACTIVE_VIDEO_TASK_STATUSES] },
      },
      data: {
        status: "completed",
        videoUrl: input.result.videoUrl,
        coverUrl: input.result.coverUrl ?? null,
        duration: input.result.duration ?? null,
        completedAt: new Date(),
        errorCode: "TRANSFER_FAILED",
        errorMessage: error instanceof Error ? error.message : "成片转存失败，可稍后重试转存",
        deliveryStatus: "degraded",
        deliveryWarning: "供应商已完成生成，但 AIM 存储转存失败；请重试转存，不会重复生成。",
        deliveryExpiresAt: null,
      },
    });
    if (fallback.count > 0 && (task.status === "pending" || task.status === "processing")) {
      await releaseProviderSlot(provider);
      digitalHumanEventsTotal.inc({ provider, event: "settlement", status: "degraded" });
    }
    return findTask(input.taskId);
  }

  digitalHumanEventsTotal.inc({
    provider,
    event: "transfer",
    status: archived.deliveryStatus === "durable" ? "success" : "degraded",
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

  // Release only the provider slot if task was in pending/processing (not queued)
  if (updated.count > 0 && (task.status === "pending" || task.status === "processing")) {
    await releaseProviderSlot(provider);
    digitalHumanEventsTotal.inc({ provider, event: "settlement", status: "completed" });
  }

  return findTask(input.taskId);
}

export class VideoTaskTransferRetryError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "VideoTaskTransferRetryError";
  }
}

/** 仅重试 AIM 存储转存，不会再次创建供应商任务。 */
export async function retryVideoTaskTransfer(input: {
  taskId: string;
  userId: string;
}) {
  const task = await prisma.videoTask.findFirst({
    where: { id: input.taskId, userId: input.userId },
  });
  if (!task) throw new VideoTaskTransferRetryError("TASK_NOT_FOUND", "视频任务不存在", 404);
  if (task.status !== "completed" || task.deliveryStatus !== "degraded" || !task.videoUrl) {
    throw new VideoTaskTransferRetryError("TRANSFER_RETRY_NOT_AVAILABLE", "当前任务没有可重试的转存问题", 422);
  }

  const provider = resolveTaskProvider(task.provider);
  try {
    const archived = await archiveVideoTaskOutput({
      taskId: task.id,
      result: { videoUrl: task.videoUrl, coverUrl: task.coverUrl ?? undefined, duration: task.duration ?? undefined },
    });
    digitalHumanEventsTotal.inc({ provider, event: "transfer", status: archived.deliveryStatus === "durable" ? "success" : "degraded" });
    await prisma.videoTask.updateMany({
      where: { id: task.id, userId: input.userId, status: "completed", deliveryStatus: "degraded" },
      data: {
        videoUrl: archived.videoUrl,
        coverUrl: archived.coverUrl,
        deliveryStatus: archived.deliveryStatus,
        deliveryWarning: archived.deliveryWarning,
        deliveryExpiresAt: archived.deliveryExpiresAt,
        errorCode: archived.deliveryStatus === "durable" ? null : "TRANSFER_FAILED",
        errorMessage: archived.deliveryStatus === "durable" ? null : "转存仍未完成，请稍后重试",
      },
    });
    return findTask(task.id);
  } catch (error) {
    digitalHumanEventsTotal.inc({ provider, event: "transfer", status: "failed" });
    await prisma.videoTask.updateMany({
      where: { id: task.id, userId: input.userId, status: "completed", deliveryStatus: "degraded" },
      data: {
        errorCode: "TRANSFER_FAILED",
        errorMessage: error instanceof Error ? error.message : "转存仍未完成，请稍后重试",
        deliveryWarning: "供应商已完成生成，但 AIM 存储转存仍未完成；请稍后重试。",
      },
    });
    throw new VideoTaskTransferRetryError("TRANSFER_FAILED", "成片转存失败，请稍后重试", 502);
  }
}

export function buildReservedVideoTaskDefaults() {
  return buildPendingDeliverySnapshot();
}
