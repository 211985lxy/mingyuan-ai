import { prisma } from "@/lib/prisma";
import { submitEnhancementJob } from "@/lib/aliyun-enhancement";
import { persistVideoThumbnail, transferLargeFileToOss } from "@/lib/oss";

export async function triggerVideoEnhancement(input: {
  taskId: string;
  sourceVideoUrl: string;
}): Promise<void> {
  // Step 1: Mark as pending FIRST (before API call) to prevent race conditions.
  // If webhook arrives before we save the jobId, the polling cron will catch it.
  const updated = await prisma.videoTask.updateMany({
    where: {
      id: input.taskId,
      enhancementStatus: null, // Only trigger if not already triggered
    },
    data: {
      enhancementStatus: "pending",
      enhancementStartedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    console.log(
      `[enhancement] Task ${input.taskId} already has enhancement status, skipping trigger`
    );
    return;
  }

  // Step 2: Submit to Aliyun API
  try {
    const { jobId } = await submitEnhancementJob({
      taskId: input.taskId,
      sourceVideoUrl: input.sourceVideoUrl,
    });

    // Step 3: Store jobId and mark as processing
    await prisma.videoTask.update({
      where: { id: input.taskId },
      data: {
        enhancementStatus: "processing",
        enhancementJobId: jobId,
      },
    });

    console.log(
      `[enhancement] Task ${input.taskId} enhancement submitted, jobId=${jobId}`
    );
  } catch (error) {
    // API submission failed — mark as failed, do NOT block 1080p delivery
    console.error(`[enhancement] Submit failed for task ${input.taskId}:`, error);

    await prisma.videoTask.update({
      where: { id: input.taskId },
      data: {
        enhancementStatus: "failed",
        enhancementErrorCode: "SUBMIT_FAILED",
        enhancementErrorMessage:
          error instanceof Error ? error.message : "Enhancement submission failed",
        enhancementCompletedAt: new Date(),
      },
    });
  }
}

export async function settleEnhancementSuccess(input: {
  taskId: string;
  temporaryVideoUrl: string;
}): Promise<void> {
  // CRITICAL: Transfer from Aliyun temporary URL to OSS immediately.
  // Aliyun temporary URLs expire in 30 minutes.
  // Use buffer-based upload (not stream) because 4K files are 50-100MB
  // and putStream causes "premature close" on large files.
  const ossKey = `videos/${input.taskId}/enhanced-4k.mp4`;
  const transfer = await transferLargeFileToOss(input.temporaryVideoUrl, ossKey);

  if (!transfer.durable) {
    console.error(
      `[enhancement] OSS transfer failed for task ${input.taskId}: ${transfer.warning}`
    );

    await prisma.videoTask.update({
      where: { id: input.taskId },
      data: {
        enhancementStatus: "failed",
        enhancementErrorCode: "TRANSFER_FAILED",
        enhancementErrorMessage:
          transfer.warning ?? "Failed to transfer enhanced video to OSS",
        enhancementCompletedAt: new Date(),
      },
    });
    return;
  }

  // Generate 4K cover image from the enhanced video
  const coverUrl = await persistVideoThumbnail(
    transfer.url,
    `videos/${input.taskId}/enhanced-4k-cover.jpg`
  );

  // Update VideoTask with the durable OSS URL.
  // NEVER overwrite videoUrl (1080p) — enhanced4kUrl is additive.
  await prisma.videoTask.update({
    where: { id: input.taskId },
    data: {
      enhancementStatus: "completed",
      enhanced4kUrl: transfer.url,
      enhanced4kCoverUrl: coverUrl ?? null,
      enhancementCompletedAt: new Date(),
      enhancementErrorCode: null,
      enhancementErrorMessage: null,
    },
  });

  console.log(
    `[enhancement] Task ${input.taskId} enhancement completed, url=${transfer.url}`
  );
}

export async function settleEnhancementFailure(input: {
  taskId: string;
  errorCode: string;
  errorMessage: string;
}): Promise<void> {
  await prisma.videoTask.update({
    where: { id: input.taskId },
    data: {
      enhancementStatus: "failed",
      enhancementErrorCode: input.errorCode,
      enhancementErrorMessage: input.errorMessage,
      enhancementCompletedAt: new Date(),
    },
  });

  // videoUrl (1080p) is NEVER modified. User always has working video.
  console.log(
    `[enhancement] Task ${input.taskId} enhancement failed: ${input.errorCode} — ${input.errorMessage}`
  );
}
