import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { CACHE_SCHEMA_VERSION, type CachedPhotoRow } from "./contracts"

const cachedMediaSelect = {
  id: true, pexelsId: true, mediaType: true, url: true, alt: true, imageUrl: true,
  srcJson: true, videoFilesJson: true, videoPicturesJson: true, ossUrl: true, ossStatus: true,
} as const;

type Provider = "pexels" | "pixabay";

export async function loadCachedRows(queryHash: string, provider: Provider): Promise<CachedPhotoRow[] | null> {
  const cached = await prisma.pexelsQueryCache.findUnique({ where: { queryHash } });
  if (!cached) return null;
  return loadMediaRows(provider, cached.pexelsIds as number[]);
}

export async function loadMediaRows(provider: Provider, ids: number[]): Promise<CachedPhotoRow[]> {
  const rows = await prisma.pexelsMedia.findMany({
    where: { provider, pexelsId: { in: ids } }, select: cachedMediaSelect,
  });
  return ids.map((id) => rows.find((row) => row.pexelsId === id))
    .filter((row): row is (typeof rows)[number] => row != null)
    .map((row) => ({ ...row, provider } as CachedPhotoRow));
}

export async function saveQueryCache(input: {
  provider: Provider; queryHash: string; query: string; mediaType: "photo" | "video";
  orientation: string; size?: string | null; totalResults: number; ids: number[];
}): Promise<void> {
  await prisma.pexelsQueryCache.upsert({
    where: { queryHash: input.queryHash },
    create: {
      provider: input.provider, queryHash: input.queryHash, query: input.query, mediaType: input.mediaType,
      orientation: input.orientation, size: input.size ?? null, color: null,
      schemaVersion: CACHE_SCHEMA_VERSION, totalResults: input.totalResults,
      pexelsIds: input.ids as unknown as Prisma.InputJsonValue,
    },
    update: {
      pexelsIds: input.ids as unknown as Prisma.InputJsonValue,
      totalResults: input.totalResults, updatedAt: new Date(),
    },
  });
}
