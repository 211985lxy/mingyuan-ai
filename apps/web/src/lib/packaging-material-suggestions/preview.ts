import { selectBestVideoFile } from "@/lib/pexels"
import type { PexelsVideoFile, PexelsVideoPicture } from "@/types/pexels"
import type { CachedPhotoRow } from "./contracts"

export function getPhotoPreviewUrls(row: CachedPhotoRow): {
  fileUrl: string;
  previewUrl: string;
  thumbnailUrl: string;
} {
  // srcJson may be a Prisma JsonValue; extract as record
  const raw = row.srcJson;
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  const large = typeof src?.large === "string" ? src.large : undefined;
  const medium = typeof src?.medium === "string" ? src.medium : undefined;
  const small = typeof src?.small === "string" ? src.small : undefined;
  const tiny = typeof src?.tiny === "string" ? src.tiny : undefined;
  const original = typeof src?.original === "string" ? src.original : undefined;

  const previewUrl = row.ossUrl || large || medium || original || row.url;
  const thumbnailUrl = medium || small || tiny || previewUrl;
  return {
    fileUrl: previewUrl,
    previewUrl,
    thumbnailUrl,
  };
}

export function getVideoPreviewUrls(row: CachedPhotoRow): {
  fileUrl: string;
  previewUrl: string;
  thumbnailUrl: string;
} {
  const videoFiles = Array.isArray(row.videoFilesJson)
    ? (row.videoFilesJson as PexelsVideoFile[])
    : []
  const bestVideo = selectBestVideoFile(videoFiles)
  const pictures = Array.isArray(row.videoPicturesJson)
    ? (row.videoPicturesJson as PexelsVideoPicture[])
    : []
  const poster = row.imageUrl ?? pictures[0]?.picture ?? row.url
  const playbackUrl = row.ossUrl ?? bestVideo?.link ?? row.url

  return {
    fileUrl: playbackUrl,
    previewUrl: playbackUrl,
    thumbnailUrl: poster,
  }
}
