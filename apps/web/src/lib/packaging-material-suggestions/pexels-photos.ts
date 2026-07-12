import type { Prisma } from "@/generated/prisma/client"
import { computeQueryHash, searchPhotos } from "@/lib/pexels"
import { prisma } from "@/lib/prisma"
import type { PexelsPhoto } from "@/types/pexels"
import { CACHE_SCHEMA_VERSION, SEARCH_LOCALE, SEARCH_ORIENTATION, SEARCH_SIZE, type CachedPhotoRow } from "./contracts"
import { loadCachedRows, loadMediaRows, saveQueryCache } from "./media-cache"

function buildPhotoCreateData(photo: PexelsPhoto, query: string) {
  return {
    provider: "pexels" as const, pexelsId: photo.id, mediaType: "photo" as const,
    width: photo.width, height: photo.height, url: photo.url, photographer: photo.photographer,
    photographerUrl: photo.photographer_url, photographerId: photo.photographer_id,
    avgColor: photo.avg_color, alt: photo.alt,
    srcJson: JSON.parse(JSON.stringify(photo.src)) as Prisma.InputJsonValue,
    discoveryQuery: query,
  };
}

async function persistPhotos(photos: PexelsPhoto[], query: string): Promise<number[]> {
  const ids: number[] = [];
  for (const photo of photos) {
    await prisma.pexelsMedia.upsert({
      where: { provider_pexelsId: { provider: "pexels", pexelsId: photo.id } },
      create: buildPhotoCreateData(photo, query), update: { updatedAt: new Date() },
    });
    ids.push(photo.id);
  }
  return ids;
}

export async function loadPhotosForQuery(query: string, perPage: number): Promise<CachedPhotoRow[]> {
  const queryHash = computeQueryHash({
    query, mediaType: "photo", orientation: SEARCH_ORIENTATION, size: SEARCH_SIZE,
    locale: SEARCH_LOCALE, page: 1, perPage, schemaVersion: CACHE_SCHEMA_VERSION,
  });
  const cachedRows = await loadCachedRows(queryHash, "pexels");
  if (cachedRows) return cachedRows;

  const response = await searchPhotos(query, {
    orientation: SEARCH_ORIENTATION, size: SEARCH_SIZE, locale: SEARCH_LOCALE, page: 1, perPage,
  });
  const ids = await persistPhotos(response.photos, query);
  await saveQueryCache({
    provider: "pexels", queryHash, query, mediaType: "photo", orientation: SEARCH_ORIENTATION,
    size: SEARCH_SIZE, totalResults: response.total_results, ids,
  });
  return loadMediaRows("pexels", ids);
}
