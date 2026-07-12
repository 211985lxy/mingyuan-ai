import type { Prisma } from "@/generated/prisma/client"
import { computeQueryHash, searchVideos } from "@/lib/pexels"
import { prisma } from "@/lib/prisma"
import type { PexelsVideo } from "@/types/pexels"
import { CACHE_SCHEMA_VERSION, SEARCH_LOCALE, SEARCH_ORIENTATION, SEARCH_SIZE, type CachedPhotoRow } from "./contracts"
import { loadCachedRows, loadMediaRows, saveQueryCache } from "./media-cache"
import { loadImagesFromAllProviders } from "./pixabay-images"

function buildVideoCreateData(video: PexelsVideo, query: string) {
  return {
    provider: "pexels" as const, pexelsId: video.id, mediaType: "video" as const,
    width: video.width, height: video.height, url: video.url, photographer: video.user.name,
    photographerUrl: video.user.url, photographerId: video.user.id, duration: video.duration,
    imageUrl: video.image,
    videoFilesJson: JSON.parse(JSON.stringify(video.video_files)) as Prisma.InputJsonValue,
    videoPicturesJson: JSON.parse(JSON.stringify(video.video_pictures)) as Prisma.InputJsonValue,
    discoveryQuery: query,
  };
}

async function persistVideos(videos: PexelsVideo[], query: string): Promise<number[]> {
  const ids: number[] = [];
  for (const video of videos) {
    await prisma.pexelsMedia.upsert({
      where: { provider_pexelsId: { provider: "pexels", pexelsId: video.id } },
      create: buildVideoCreateData(video, query), update: { updatedAt: new Date() },
    });
    ids.push(video.id);
  }
  return ids;
}

export async function loadVideosForQuery(query: string, perPage: number): Promise<CachedPhotoRow[]> {
  const queryHash = computeQueryHash({
    query, mediaType: "video", orientation: SEARCH_ORIENTATION, size: SEARCH_SIZE,
    locale: SEARCH_LOCALE, page: 1, perPage, schemaVersion: CACHE_SCHEMA_VERSION,
  });
  const cachedRows = await loadCachedRows(queryHash, "pexels");
  if (cachedRows) return cachedRows;

  const response = await searchVideos(query, {
    orientation: SEARCH_ORIENTATION, size: SEARCH_SIZE, locale: SEARCH_LOCALE, page: 1, perPage,
  });
  const ids = await persistVideos(response.videos, query);
  await saveQueryCache({
    provider: "pexels", queryHash, query, mediaType: "video", orientation: SEARCH_ORIENTATION,
    size: SEARCH_SIZE, totalResults: response.total_results, ids,
  });
  return loadMediaRows("pexels", ids);
}

export async function loadMediaFromAllProviders(
  query: string, mediaType: "image" | "video", perPage: number,
): Promise<CachedPhotoRow[]> {
  return mediaType === "video" ? loadVideosForQuery(query, perPage) : loadImagesFromAllProviders(query, perPage);
}
