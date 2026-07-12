import type { Prisma } from "@/generated/prisma/client"
import { computeQueryHash, searchImages } from "@/lib/pixabay"
import { prisma } from "@/lib/prisma"
import { CACHE_SCHEMA_VERSION, type CachedPhotoRow } from "./contracts"
import { loadCachedRows, loadMediaRows, saveQueryCache } from "./media-cache"
import { loadPhotosForQuery } from "./pexels-photos"

function buildPixabayCreateData(image: {
  id: number; webformatWidth: number; webformatHeight: number; pageURL: string;
  user: string; user_id: number; tags: string; largeImageURL: string; webformatURL: string; previewURL: string;
}, query: string) {
  const srcJson = {
    original: image.largeImageURL, large2x: image.largeImageURL,
    large: image.webformatURL.replace("_640", "_960"), medium: image.webformatURL.replace("_640", "_340"),
    small: image.previewURL, portrait: image.webformatURL, landscape: image.webformatURL, tiny: image.previewURL,
  };
  return {
    provider: "pixabay" as const, pexelsId: image.id, mediaType: "photo" as const,
    width: image.webformatWidth, height: image.webformatHeight, url: image.pageURL,
    photographer: image.user, photographerId: image.user_id, alt: image.tags,
    srcJson: srcJson as unknown as Prisma.InputJsonValue, discoveryQuery: query,
  };
}

async function persistPixabayImages(images: Parameters<typeof buildPixabayCreateData>[0][], query: string): Promise<number[]> {
  const ids: number[] = [];
  for (const image of images) {
    await prisma.pexelsMedia.upsert({
      where: { provider_pexelsId: { provider: "pixabay", pexelsId: image.id } },
      create: buildPixabayCreateData(image, query), update: { updatedAt: new Date() },
    });
    ids.push(image.id);
  }
  return ids;
}

export async function loadPixabayImagesForQuery(query: string, perPage: number): Promise<CachedPhotoRow[]> {
  try {
    const queryHash = computeQueryHash({
      query, mediaType: "photo", orientation: "horizontal", page: 1, perPage, schemaVersion: CACHE_SCHEMA_VERSION,
    });
    const cachedRows = await loadCachedRows(queryHash, "pixabay");
    if (cachedRows) return cachedRows;

    const response = await searchImages(query, {
      imageType: "photo", orientation: "horizontal", safesearch: true, page: 1, perPage,
    });
    const ids = await persistPixabayImages(response.hits, query);
    if (ids.length > 0) {
      await saveQueryCache({
        provider: "pixabay", queryHash, query, mediaType: "photo", orientation: "horizontal",
        totalResults: response.totalHits, ids,
      });
    }
    return loadMediaRows("pixabay", ids);
  } catch (error) {
    console.warn("[packaging-material-suggestions] Pixabay search failed:", error);
    return [];
  }
}

export async function loadImagesFromAllProviders(query: string, perPage: number): Promise<CachedPhotoRow[]> {
  const perProvider = Math.ceil(perPage / 2);
  const [pexelsRows, pixabayRows] = await Promise.all([
    loadPhotosForQuery(query, perProvider), loadPixabayImagesForQuery(query, perProvider),
  ]);
  const merged: CachedPhotoRow[] = [];
  for (let index = 0; index < Math.max(pexelsRows.length, pixabayRows.length); index += 1) {
    if (index < pexelsRows.length) merged.push(pexelsRows[index]);
    if (index < pixabayRows.length) merged.push(pixabayRows[index]);
  }
  return merged;
}
