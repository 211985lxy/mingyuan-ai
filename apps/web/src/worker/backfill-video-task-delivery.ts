import { env } from "@/env"
import { prisma } from "@/lib/prisma";
import {
  isManagedOssUrl,
  persistVideoThumbnail,
  transferFromUrlDetailed,
} from "@/lib/oss";
import {
  buildDegradedDeliverySnapshot,
  buildDurableDeliverySnapshot,
} from "@/lib/video-task-domain";

const DEFAULT_BATCH_SIZE = 50;

function readBatchSize(): number {
  const parsed = Number(env.VIDEO_TASK_DELIVERY_BACKFILL_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BATCH_SIZE;
  }
  return parsed;
}

async function backfillTask(task: {
  id: string;
  videoUrl: string | null;
  coverUrl: string | null;
}) {
  if (!task.videoUrl) return "skipped";

  if (isManagedOssUrl(task.videoUrl)) {
    let coverUrl = task.coverUrl;
    if (!coverUrl) {
      coverUrl =
        (await persistVideoThumbnail(task.videoUrl, `videos/${task.id}/cover.jpg`)) ??
        null;
    }

    await prisma.videoTask.update({
      where: { id: task.id },
      data: {
        coverUrl,
        ...buildDurableDeliverySnapshot(),
      },
    });
    return "durable";
  }

  const videoTransfer = await transferFromUrlDetailed(
    task.videoUrl,
    `videos/${task.id}/video.mp4`,
  );

  if (!videoTransfer.durable) {
    await prisma.videoTask.update({
      where: { id: task.id },
      data: {
        videoUrl: videoTransfer.url,
        ...buildDegradedDeliverySnapshot({
          warning:
            videoTransfer.warning ??
            "结果视频仍依赖临时链接，尚未完成持久化转存。",
          expiresAt: videoTransfer.expiresAt,
        }),
      },
    });
    return "degraded";
  }

  let coverUrl: string | null = null;
  if (task.coverUrl) {
    const coverTransfer = await transferFromUrlDetailed(
      task.coverUrl,
      `videos/${task.id}/cover.jpg`,
    );
    coverUrl = coverTransfer.durable ? coverTransfer.url : null;
  }

  if (!coverUrl) {
    coverUrl =
      (await persistVideoThumbnail(videoTransfer.url, `videos/${task.id}/cover.jpg`)) ??
      null;
  }

  await prisma.videoTask.update({
    where: { id: task.id },
    data: {
      videoUrl: videoTransfer.url,
      coverUrl,
      ...buildDurableDeliverySnapshot(),
    },
  });
  return "durable";
}

export async function runDeliveryBackfill() {
  const take = readBatchSize();

  const tasks = await prisma.videoTask.findMany({
    where: {
      status: "completed",
      videoUrl: { not: null },
      OR: [
        { deliveryStatus: "pending" },
        { deliveryStatus: "degraded" },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take,
    select: {
      id: true,
      videoUrl: true,
      coverUrl: true,
    },
  });

  const summary = {
    scanned: tasks.length,
    durable: 0,
    degraded: 0,
    skipped: 0,
    failed: 0,
  };

  for (const task of tasks) {
    try {
      const result = await backfillTask(task);
      if (result === "durable") summary.durable++;
      else if (result === "degraded") summary.degraded++;
      else summary.skipped++;
    } catch (error) {
      summary.failed++;
      console.error(`[video-task-delivery-backfill] Failed for ${task.id}:`, error);
    }
  }

  console.log("[video-task-delivery-backfill] Completed", summary);
  return summary;
}

// Allow running as standalone script
if (require.main === module) {
  runDeliveryBackfill()
    .catch((error) => {
      console.error("[video-task-delivery-backfill] Fatal error:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
