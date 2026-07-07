import { prisma } from "@/lib/prisma";
import { transferFromUrl } from "@/lib/oss";
import { selectBestVideoFile } from "@/lib/pexels";
import type { PexelsPhotoSrc, PexelsVideoFile } from "@/types/pexels";

/**
 * Transfer a single PexelsMedia item (Pexels or Pixabay) to OSS.
 * Photo: transfers best available image as JPEG.
 * Video: transfers best HD MP4 file.
 */
export async function transferPexelsMediaToOss(media: {
  id: string;
  pexelsId: number;
  mediaType: string;
  ossStatus: string;
  srcJson: unknown;
  videoFilesJson: unknown;
  provider?: string;
}): Promise<void> {
  if (media.ossStatus !== "pending") return;

  await prisma.pexelsMedia.update({
    where: { id: media.id },
    data: { ossStatus: "transferring" },
  });

  const provider = media.provider ?? "pexels";
  const prefix = provider === "pixabay" ? "pixabay" : "pexels";

  try {
    let sourceUrl: string;
    let destKey: string;

    if (media.mediaType === "photo") {
      const src = media.srcJson as PexelsPhotoSrc;
      sourceUrl = src?.large2x ?? src?.large ?? src?.original ?? "";
      if (!sourceUrl) throw new Error("No suitable photo source found");
      destKey = `${prefix}/photos/${media.pexelsId}.jpg`;
    } else {
      const videoFiles = media.videoFilesJson as PexelsVideoFile[];
      if (!videoFiles?.length) throw new Error("No video files found");
      const best = selectBestVideoFile(videoFiles);
      if (!best) throw new Error("No suitable video file (MP4) found");
      sourceUrl = best.link;
      destKey = `${prefix}/videos/${media.pexelsId}.mp4`;
    }

    const ossUrl = await transferFromUrl(sourceUrl, destKey);

    await prisma.pexelsMedia.update({
      where: { id: media.id },
      data: {
        ossUrl,
        ossStatus: "ready",
        ossTransferredAt: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `[${prefix}-oss] Transfer failed for id=${media.pexelsId}:`,
      error,
    );
    await prisma.pexelsMedia.update({
      where: { id: media.id },
      data: { ossStatus: "failed" },
    });
  }
}

/**
 * Batch transfer pending PexelsMedia items to OSS.
 * Used by the cron endpoint as a safety net.
 */
export async function transferPendingPexelsMedia(
  limit = 10,
): Promise<number> {
  const pending = await prisma.pexelsMedia.findMany({
    where: { ossStatus: "pending" },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let transferred = 0;
  for (const media of pending) {
    await transferPexelsMediaToOss(media);
    transferred++;
  }
  return transferred;
}
