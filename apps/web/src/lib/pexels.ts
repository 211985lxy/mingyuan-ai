import { env, getIndexedEnvironmentValue } from "@/env"
import { createHash } from "crypto";
import type {
  PexelsApiKey,
  PexelsPhoto,
  PexelsPhotoSearchResponse,
  PexelsPhotoSrc,
  PexelsVideo,
  PexelsVideoFile,
  PexelsVideoSearchResponse,
} from "@/types/pexels";

// ─── Error ─────────────────────────────────────────────

export class PexelsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PexelsError";
  }
}

// ─── Multi-Key Pool ────────────────────────────────────

const keyPool: PexelsApiKey[] = [];

function loadKeys(): void {
  if (keyPool.length > 0) return;

  let i = 1;
  while (getIndexedEnvironmentValue("PEXELS_API_KEY", i)) {
    keyPool.push({
      key: getIndexedEnvironmentValue("PEXELS_API_KEY", i)!,
      index: i,
      remainingRequests: 200,
      lastUsedAt: 0,
    });
    i++;
  }

  if (keyPool.length === 0) {
    throw new PexelsError(
      "NO_KEYS",
      "No PEXELS_API_KEY_* environment variables configured",
    );
  }
}

/** Pick the key with the most remaining quota. */
function getNextKey(): PexelsApiKey {
  const available = keyPool
    .filter((k) => k.remainingRequests > 0)
    .sort((a, b) => b.remainingRequests - a.remainingRequests);

  if (available.length === 0) {
    throw new PexelsError(
      "ALL_KEYS_EXHAUSTED",
      "All Pexels API keys have been rate-limited",
    );
  }
  return available[0];
}

export function getKeyPoolStatus() {
  loadKeys();
  return {
    total: keyPool.length,
    available: keyPool.filter((k) => k.remainingRequests > 0).length,
    exhausted: keyPool.filter((k) => k.remainingRequests <= 0).length,
    keys: keyPool.map((k) => ({
      index: k.index,
      remaining: k.remainingRequests,
      lastUsedAt: k.lastUsedAt,
    })),
  };
}

// ─── Base Request with Retry ───────────────────────────

const PEXELS_BASE_URL = env.PEXELS_API_ENDPOINT || "https://api.pexels.com";

async function pexelsRequest<T>(
  path: string,
  params?: Record<string, string>,
  retryCount = 0,
): Promise<T> {
  loadKeys();

  const apiKey = getNextKey();
  const url = new URL(path, PEXELS_BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey.key },
    signal: AbortSignal.timeout(15_000),
  });

  // Track rate limit headers
  const remaining = res.headers.get("X-Ratelimit-Remaining");
  if (remaining !== null) {
    apiKey.remainingRequests = parseInt(remaining, 10);
  }
  apiKey.lastUsedAt = Date.now();

  if (res.status === 429) {
    console.warn(
      `[pexels] Key #${apiKey.index} rate-limited, remaining keys: ${keyPool.filter((k) => k.remainingRequests > 0).length - 1}`,
    );
    apiKey.remainingRequests = 0;
    if (retryCount < keyPool.length - 1) {
      return pexelsRequest<T>(path, params, retryCount + 1);
    }
    throw new PexelsError(
      "RATE_LIMITED",
      "All Pexels API keys have been rate-limited",
    );
  }

  if (!res.ok) {
    throw new PexelsError(
      "API_ERROR",
      `Pexels API error: ${res.status} ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Public API Functions ──────────────────────────────

export async function searchPhotos(
  query: string,
  options?: {
    orientation?: string;
    size?: string;
    color?: string;
    locale?: string;
    page?: number;
    perPage?: number;
  },
): Promise<PexelsPhotoSearchResponse> {
  const params: Record<string, string> = { query };
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.size) params.size = options.size;
  if (options?.color) params.color = options.color;
  if (options?.locale) params.locale = options.locale;
  if (options?.page) params.page = String(options.page);
  if (options?.perPage) params.per_page = String(options.perPage);

  return pexelsRequest<PexelsPhotoSearchResponse>("/v1/search", params);
}

export async function searchVideos(
  query: string,
  options?: {
    orientation?: string;
    size?: string;
    locale?: string;
    page?: number;
    perPage?: number;
  },
): Promise<PexelsVideoSearchResponse> {
  const params: Record<string, string> = { query };
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.size) params.size = options.size;
  if (options?.locale) params.locale = options.locale;
  if (options?.page) params.page = String(options.page);
  if (options?.perPage) params.per_page = String(options.perPage);

  return pexelsRequest<PexelsVideoSearchResponse>("/videos/search", params);
}

export async function getPhoto(id: number): Promise<PexelsPhoto> {
  return pexelsRequest<PexelsPhoto>(`/v1/photos/${id}`);
}

export async function getVideo(id: number): Promise<PexelsVideo> {
  return pexelsRequest<PexelsVideo>(`/videos/videos/${id}`);
}

// ─── Helpers ───────────────────────────────────────────

export function selectBestPhotoUrl(src: PexelsPhotoSrc): string {
  return src.original;
}

/** Shanjian rejects materials with resolution > 2000 on either dimension. */
const MAX_MATERIAL_DIMENSION = 2000;

export function selectBestVideoFile(
  videoFiles: PexelsVideoFile[],
): PexelsVideoFile | null {
  const withinLimit = (f: PexelsVideoFile) =>
    f.width <= MAX_MATERIAL_DIMENSION && f.height <= MAX_MATERIAL_DIMENSION;

  // Prefer HD mp4 within Shanjian resolution limit, then SD, then any mp4
  const candidates = videoFiles.filter(withinLimit);
  return (
    candidates.find(
      (f) => f.quality === "hd" && f.file_type === "video/mp4",
    ) ??
    candidates.find(
      (f) => f.quality === "sd" && f.file_type === "video/mp4",
    ) ??
    candidates.find(
      (f) => f.file_type === "video/mp4",
    ) ??
    candidates[0] ??
    // Fallback: if ALL files exceed limit, pick smallest available mp4
    videoFiles
      .filter((f) => f.file_type === "video/mp4")
      .sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height))[0] ??
    null
  );
}

export function computeQueryHash(params: {
  query: string;
  mediaType: string;
  orientation?: string;
  size?: string;
  color?: string;
  locale?: string;
  page: number;
  perPage: number;
  schemaVersion?: number;
}): string {
  const normalized = [
    "pexels",
    params.query.toLowerCase().trim(),
    params.mediaType,
    params.orientation ?? "",
    params.size ?? "",
    params.color ?? "",
    params.locale ?? "",
    String(params.page),
    String(params.perPage),
    String(params.schemaVersion ?? 1),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}
