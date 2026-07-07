import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { withUserAuth } from "@/lib/user-auth";
import {
  searchPhotos,
  searchVideos,
  computeQueryHash as pexelsQueryHash,
  PexelsError,
} from "@/lib/pexels";
import {
  searchImages as searchPixabayImages,
  searchVideos as searchPixabayVideos,
  computeQueryHash as pixabayQueryHash,
  PixabayError,
} from "@/lib/pixabay";
import { transferPexelsMediaToOss } from "@/lib/pexels-oss";
import { signOssUrls } from "@/lib/oss";
import type {
  PexelsMediaType,
  PexelsPhoto,
  PexelsVideo,
  PexelsSearchResult,
} from "@/types/pexels";
import type { PixabayImage, PixabayVideo } from "@/types/pixabay";

export const runtime = "nodejs";

// ─── GET /api/pexels/search ─────────────────────────────

export const GET = withUserAuth(async (request) => {
  const { searchParams } = new URL(request.url);

  const query = searchParams.get("query");
  if (!query?.trim()) {
    return NextResponse.json(
      { error: "query is required" },
      { status: 400 },
    );
  }

  const mediaType = (searchParams.get("mediaType") ?? "photo") as PexelsMediaType;
  const orientation = searchParams.get("orientation") ?? undefined;
  const size = searchParams.get("size") ?? undefined;
  const color = searchParams.get("color") ?? undefined;
  const locale = searchParams.get("locale") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const perPage = Math.min(
    80,
    Math.max(1, parseInt(searchParams.get("perPage") ?? "20", 10)),
  );

  // Each provider gets half, merged total ≈ perPage
  const perProvider = Math.ceil(perPage / 2);

  // Search both providers in parallel
  const [pexelsResult, pixabayResult] = await Promise.allSettled([
    fetchPexelsWithCache({
      query,
      mediaType,
      orientation,
      size,
      color,
      locale,
      page,
      perPage: perProvider,
    }),
    fetchPixabayWithCache({
      query,
      mediaType,
      orientation,
      category,
      page,
      perPage: perProvider,
    }),
  ]);

  const pexels =
    pexelsResult.status === "fulfilled"
      ? pexelsResult.value
      : { results: [] as PexelsSearchResult[], totalResults: 0 };

  const pixabay =
    pixabayResult.status === "fulfilled"
      ? pixabayResult.value
      : { results: [] as PexelsSearchResult[], totalResults: 0 };

  if (pexelsResult.status === "rejected") {
    console.warn("[search] Pexels search failed:", pexelsResult.reason);
  }
  if (pixabayResult.status === "rejected") {
    console.warn("[search] Pixabay search failed:", pixabayResult.reason);
  }

  // Both failed
  if (pexels.results.length === 0 && pixabay.results.length === 0) {
    if (pexelsResult.status === "rejected") {
      const err = pexelsResult.reason;
      if (err instanceof PexelsError) {
        const status =
          err.code === "RATE_LIMITED" || err.code === "ALL_KEYS_EXHAUSTED"
            ? 429
            : 502;
        return NextResponse.json({ error: err.message }, { status });
      }
    }
    if (pixabayResult.status === "rejected") {
      const err = pixabayResult.reason;
      if (err instanceof PixabayError) {
        return NextResponse.json({ error: err.message }, { status: 502 });
      }
    }
  }

  // Interleave results, trim to perPage
  const merged = interleave(pexels.results, pixabay.results).slice(0, perPage);
  const totalResults = pexels.totalResults + pixabay.totalResults;

  return NextResponse.json({
    data: signOssUrls({
      results: merged,
      totalResults,
      page,
      perPage,
      hasMore: page * perPage < totalResults,
      source: "merged" as const,
    }),
  });
});

// ─── Interleave Helper ──────────────────────────────────

function interleave<T>(a: T[], b: T[]): T[] {
  const result: T[] = [];
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < a.length) result.push(a[i]);
    if (i < b.length) result.push(b[i]);
  }
  return result;
}

// ─── Shared DB helpers ──────────────────────────────────

type MediaRow = {
  id: string;
  provider: string;
  pexelsId: number;
  mediaType: string;
  width: number;
  height: number;
  url: string;
  photographer: string;
  avgColor: string | null;
  alt: string | null;
  duration: number | null;
  srcJson: unknown;
  videoFilesJson: unknown;
  imageUrl: string | null;
  ossUrl: string | null;
  ossStatus: string;
};

function toSearchResult(row: MediaRow): PexelsSearchResult {
  const raw = row.srcJson;
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, string>)
      : null;
  const videoFiles = row.videoFilesJson as PexelsSearchResult["videoFiles"];

  let thumbnailUrl = "";
  let previewUrl = "";

  if (row.mediaType === "photo" && src) {
    thumbnailUrl = src.medium || src.small || "";
    previewUrl = row.ossUrl || src.large || src.medium || src.original || "";
  } else if (row.mediaType === "video") {
    thumbnailUrl = row.imageUrl || "";
    previewUrl = row.ossUrl || row.imageUrl || "";
  }

  return {
    id: row.id,
    pexelsId: row.pexelsId,
    provider: row.provider as "pexels" | "pixabay",
    mediaType: row.mediaType as "photo" | "video",
    width: row.width,
    height: row.height,
    url: row.url,
    photographer: row.photographer,
    avgColor: row.avgColor,
    alt: row.alt,
    duration: row.duration,
    thumbnailUrl,
    previewUrl,
    ossUrl: row.ossUrl,
    ossStatus: row.ossStatus,
    src: src as PexelsSearchResult["src"],
    videoFiles,
  };
}

function fireOssTransfers(
  externalIds: number[],
  provider: string,
): void {
  prisma.pexelsMedia
    .findMany({
      where: {
        provider,
        pexelsId: { in: externalIds },
        ossStatus: "pending",
      },
      select: {
        id: true,
        provider: true,
        pexelsId: true,
        mediaType: true,
        ossStatus: true,
        srcJson: true,
        videoFilesJson: true,
      },
    })
    .then((pending) => {
      for (const media of pending) {
        transferPexelsMediaToOss(media).catch((err) =>
          console.error(`[${provider}] Background transfer error:`, err),
        );
      }
    })
    .catch((err) =>
      console.error(`[${provider}] Pending query error:`, err),
    );
}

// ─── Pexels: Search with DB Cache ────────────────────────

async function fetchPexelsWithCache(params: {
  query: string;
  mediaType: PexelsMediaType;
  orientation?: string;
  size?: string;
  color?: string;
  locale?: string;
  page: number;
  perPage: number;
}): Promise<{ results: PexelsSearchResult[]; totalResults: number }> {
  const { query, mediaType, orientation, size, color, locale, page, perPage } =
    params;

  const queryHash = pexelsQueryHash({
    query,
    mediaType,
    orientation,
    size,
    color,
    locale,
    page,
    perPage,
  });

  // 1. Check DB cache
  const cached = await prisma.pexelsQueryCache.findUnique({
    where: { queryHash },
  });

  if (cached) {
    const ids = cached.pexelsIds as number[];
    const media = await prisma.pexelsMedia.findMany({
      where: { provider: "pexels", pexelsId: { in: ids } },
    });
    const ordered = ids
      .map((pid) => media.find((m) => m.pexelsId === pid))
      .filter(Boolean) as typeof media;

    return {
      results: ordered.map(toSearchResult),
      totalResults: cached.totalResults,
    };
  }

  // 2. Call Pexels API
  const { items, totalResults } = await fetchFromPexelsApi(params);

  // 3. Upsert to DB
  const externalIds: number[] = [];
  for (const item of items) {
    await prisma.pexelsMedia.upsert({
      where: {
        provider_pexelsId: { provider: "pexels", pexelsId: item.pexelsId },
      },
      create: {
        provider: "pexels",
        pexelsId: item.pexelsId,
        mediaType: item.mediaType,
        width: item.width,
        height: item.height,
        url: item.url,
        photographer: item.photographer,
        photographerUrl: item.photographerUrl,
        photographerId: item.photographerId,
        avgColor: item.avgColor,
        alt: item.alt,
        duration: item.duration,
        srcJson: item.srcJson ?? undefined,
        videoFilesJson: item.videoFilesJson ?? undefined,
        videoPicturesJson: item.videoPicturesJson ?? undefined,
        imageUrl: item.imageUrl,
        discoveryQuery: query,
      },
      update: { updatedAt: new Date() },
    });
    externalIds.push(item.pexelsId);
  }

  // 4. Save query cache
  if (externalIds.length > 0) {
    await prisma.pexelsQueryCache.upsert({
      where: { queryHash },
      create: {
        provider: "pexels",
        queryHash,
        query,
        mediaType,
        orientation: orientation ?? null,
        size: size ?? null,
        color: color ?? null,
        totalResults,
        pexelsIds: externalIds as unknown as Prisma.InputJsonValue,
      },
      update: {
        pexelsIds: externalIds as unknown as Prisma.InputJsonValue,
        totalResults,
        updatedAt: new Date(),
      },
    });
  }

  // 5. Fire-and-forget OSS transfers
  if (externalIds.length > 0) {
    fireOssTransfers(externalIds, "pexels");
  }

  // 6. Return from DB
  const dbMedia = await prisma.pexelsMedia.findMany({
    where: { provider: "pexels", pexelsId: { in: externalIds } },
  });
  const ordered = externalIds
    .map((pid) => dbMedia.find((m) => m.pexelsId === pid))
    .filter(Boolean) as typeof dbMedia;

  return {
    results: ordered.map(toSearchResult),
    totalResults,
  };
}

// ─── Pixabay: Search with DB Cache ──────────────────────

async function fetchPixabayWithCache(params: {
  query: string;
  mediaType: PexelsMediaType;
  orientation?: string;
  category?: string;
  page: number;
  perPage: number;
}): Promise<{ results: PexelsSearchResult[]; totalResults: number }> {
  const { query, mediaType, orientation, category, page, perPage } = params;

  const queryHash = pixabayQueryHash({
    query,
    mediaType,
    orientation,
    category,
    page,
    perPage,
  });

  // 1. Check DB cache
  const cached = await prisma.pexelsQueryCache.findUnique({
    where: { queryHash },
  });

  if (cached) {
    const ids = cached.pexelsIds as number[];
    const media = await prisma.pexelsMedia.findMany({
      where: { provider: "pixabay", pexelsId: { in: ids } },
    });
    const ordered = ids
      .map((pid) => media.find((m) => m.pexelsId === pid))
      .filter(Boolean) as typeof media;

    return {
      results: ordered.map(toSearchResult),
      totalResults: cached.totalResults,
    };
  }

  // 2. Call Pixabay API
  const { items, totalResults } = await fetchFromPixabayApi(params);

  // 3. Upsert to DB
  const externalIds: number[] = [];
  for (const item of items) {
    await prisma.pexelsMedia.upsert({
      where: {
        provider_pexelsId: { provider: "pixabay", pexelsId: item.pexelsId },
      },
      create: {
        provider: "pixabay",
        pexelsId: item.pexelsId,
        mediaType: item.mediaType,
        width: item.width,
        height: item.height,
        url: item.url,
        photographer: item.photographer,
        photographerUrl: item.photographerUrl,
        photographerId: item.photographerId,
        avgColor: item.avgColor,
        alt: item.alt,
        duration: item.duration,
        srcJson: item.srcJson ?? undefined,
        videoFilesJson: item.videoFilesJson ?? undefined,
        videoPicturesJson: item.videoPicturesJson ?? undefined,
        imageUrl: item.imageUrl,
        discoveryQuery: query,
      },
      update: { updatedAt: new Date() },
    });
    externalIds.push(item.pexelsId);
  }

  // 4. Save query cache
  if (externalIds.length > 0) {
    await prisma.pexelsQueryCache.upsert({
      where: { queryHash },
      create: {
        provider: "pixabay",
        queryHash,
        query,
        mediaType,
        orientation: orientation ?? null,
        totalResults,
        pexelsIds: externalIds as unknown as Prisma.InputJsonValue,
      },
      update: {
        pexelsIds: externalIds as unknown as Prisma.InputJsonValue,
        totalResults,
        updatedAt: new Date(),
      },
    });
  }

  // 5. Fire-and-forget OSS transfers
  if (externalIds.length > 0) {
    fireOssTransfers(externalIds, "pixabay");
  }

  // 6. Return from DB
  const dbMedia = await prisma.pexelsMedia.findMany({
    where: { provider: "pixabay", pexelsId: { in: externalIds } },
  });
  const ordered = externalIds
    .map((pid) => dbMedia.find((m) => m.pexelsId === pid))
    .filter(Boolean) as typeof dbMedia;

  return {
    results: ordered.map(toSearchResult),
    totalResults,
  };
}

// ─── Pexels API Fetch → NormalizedItem ──────────────────

interface NormalizedItem {
  pexelsId: number;
  mediaType: "photo" | "video";
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographerUrl: string | null;
  photographerId: number | null;
  avgColor: string | null;
  alt: string | null;
  duration: number | null;
  srcJson: Prisma.InputJsonValue | null;
  videoFilesJson: Prisma.InputJsonValue | null;
  videoPicturesJson: Prisma.InputJsonValue | null;
  imageUrl: string | null;
}

async function fetchFromPexelsApi(params: {
  query: string;
  mediaType: PexelsMediaType;
  orientation?: string;
  size?: string;
  color?: string;
  locale?: string;
  page: number;
  perPage: number;
}): Promise<{ items: NormalizedItem[]; totalResults: number }> {
  const { query, mediaType, orientation, size, color, locale, page, perPage } =
    params;
  const items: NormalizedItem[] = [];
  let totalResults = 0;

  if (mediaType === "photo" || mediaType === "all") {
    const photoPerPage =
      mediaType === "all" ? Math.ceil(perPage / 2) : perPage;
    const res = await searchPhotos(query, {
      orientation,
      size,
      color,
      locale,
      page,
      perPage: photoPerPage,
    });
    totalResults += res.total_results;
    for (const photo of res.photos) {
      items.push(normalizePexelsPhoto(photo));
    }
  }

  if (mediaType === "video" || mediaType === "all") {
    const videoPerPage =
      mediaType === "all" ? Math.floor(perPage / 2) : perPage;
    const res = await searchVideos(query, {
      orientation,
      size,
      locale,
      page,
      perPage: videoPerPage,
    });
    totalResults += res.total_results;
    for (const video of res.videos) {
      items.push(normalizePexelsVideo(video));
    }
  }

  return { items, totalResults };
}

function normalizePexelsPhoto(photo: PexelsPhoto): NormalizedItem {
  return {
    pexelsId: photo.id,
    mediaType: "photo",
    width: photo.width,
    height: photo.height,
    url: photo.url,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    photographerId: photo.photographer_id,
    avgColor: photo.avg_color,
    alt: photo.alt,
    duration: null,
    srcJson: JSON.parse(JSON.stringify(photo.src)),
    videoFilesJson: null,
    videoPicturesJson: null,
    imageUrl: null,
  };
}

function normalizePexelsVideo(video: PexelsVideo): NormalizedItem {
  return {
    pexelsId: video.id,
    mediaType: "video",
    width: video.width,
    height: video.height,
    url: video.url,
    photographer: video.user.name,
    photographerUrl: video.user.url,
    photographerId: video.user.id,
    avgColor: null,
    alt: null,
    duration: video.duration,
    srcJson: null,
    videoFilesJson: JSON.parse(JSON.stringify(video.video_files)),
    videoPicturesJson: JSON.parse(JSON.stringify(video.video_pictures)),
    imageUrl: video.image,
  };
}

// ─── Pixabay API Fetch → NormalizedItem ─────────────────

async function fetchFromPixabayApi(params: {
  query: string;
  mediaType: PexelsMediaType;
  orientation?: string;
  category?: string;
  page: number;
  perPage: number;
}): Promise<{ items: NormalizedItem[]; totalResults: number }> {
  const { query, mediaType, orientation, category, page, perPage } = params;
  const items: NormalizedItem[] = [];
  let totalResults = 0;

  const pixabayOrientation =
    orientation === "landscape"
      ? "horizontal"
      : orientation === "portrait"
        ? "vertical"
        : undefined;

  if (mediaType === "photo" || mediaType === "all") {
    const imgPerPage = mediaType === "all" ? Math.ceil(perPage / 2) : perPage;
    const res = await searchPixabayImages(query, {
      imageType: "photo",
      orientation: pixabayOrientation,
      category: category as never,
      safesearch: true,
      page,
      perPage: imgPerPage,
    });
    totalResults += res.totalHits;
    for (const img of res.hits) {
      items.push(normalizePixabayImage(img));
    }
  }

  if (mediaType === "video" || mediaType === "all") {
    const vidPerPage = mediaType === "all" ? Math.floor(perPage / 2) : perPage;
    const res = await searchPixabayVideos(query, {
      category: category as never,
      safesearch: true,
      page,
      perPage: vidPerPage,
    });
    totalResults += res.totalHits;
    for (const vid of res.hits) {
      items.push(normalizePixabayVideo(vid));
    }
  }

  return { items, totalResults };
}

function normalizePixabayImage(img: PixabayImage): NormalizedItem {
  return {
    pexelsId: img.id,
    mediaType: "photo",
    width: img.webformatWidth,
    height: img.webformatHeight,
    url: img.pageURL,
    photographer: img.user,
    photographerUrl: null,
    photographerId: img.user_id,
    avgColor: null,
    alt: img.tags,
    duration: null,
    srcJson: JSON.parse(
      JSON.stringify({
        original: img.largeImageURL,
        large2x: img.largeImageURL,
        large: img.webformatURL.replace("_640", "_960"),
        medium: img.webformatURL.replace("_640", "_340"),
        small: img.previewURL,
        portrait: img.webformatURL,
        landscape: img.webformatURL,
        tiny: img.previewURL,
      }),
    ),
    videoFilesJson: null,
    videoPicturesJson: null,
    imageUrl: null,
  };
}

function normalizePixabayVideo(vid: PixabayVideo): NormalizedItem {
  const videoFiles = (
    ["large", "medium", "small", "tiny"] as const
  )
    .filter((key) => vid.videos[key] && vid.videos[key].url)
    .map((key) => {
      const size = vid.videos[key];
      return {
        id: vid.id,
        quality: key === "large" || key === "medium" ? "hd" : "sd",
        file_type: "video/mp4",
        width: size.width,
        height: size.height,
        fps: 0,
        link: size.url,
      };
    });

  const thumbnail =
    vid.videos.medium?.thumbnail ||
    vid.videos.small?.thumbnail ||
    vid.videos.tiny?.thumbnail ||
    "";

  return {
    pexelsId: vid.id,
    mediaType: "video",
    width: vid.videos.medium?.width ?? vid.videos.small?.width ?? 0,
    height: vid.videos.medium?.height ?? vid.videos.small?.height ?? 0,
    url: vid.pageURL,
    photographer: vid.user,
    photographerUrl: null,
    photographerId: vid.user_id,
    avgColor: null,
    alt: vid.tags,
    duration: vid.duration,
    srcJson: null,
    videoFilesJson: JSON.parse(JSON.stringify(videoFiles)),
    videoPicturesJson: null,
    imageUrl: thumbnail,
  };
}
