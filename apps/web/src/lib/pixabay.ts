import { env, getIndexedEnvironmentValue } from "@/env"
import { createHash } from "crypto";
import type {
  PixabayApiKey,
  PixabayImage,
  PixabayImageSearchResponse,
  PixabayVideo,
  PixabayVideoSearchResponse,
  PixabayVideoSize,
} from "@/types/pixabay";

// ─── Error ─────────────────────────────────────────────

export class PixabayError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PixabayError";
  }
}

// ─── Multi-Key Pool ────────────────────────────────────

const keyPool: PixabayApiKey[] = [];

function loadKeys(): void {
  if (keyPool.length > 0) return;

  let i = 1;
  while (getIndexedEnvironmentValue("PIXABAY_API_KEY", i)) {
    keyPool.push({
      key: getIndexedEnvironmentValue("PIXABAY_API_KEY", i)!,
      index: i,
      remainingRequests: 100, // Pixabay: 100 req/min
      lastUsedAt: 0,
    });
    i++;
  }

  if (keyPool.length === 0) {
    throw new PixabayError(
      "NO_KEYS",
      "No PIXABAY_API_KEY_* environment variables configured",
    );
  }
}

/** Pick the key with the most remaining quota. */
function getNextKey(): PixabayApiKey {
  const available = keyPool
    .filter((k) => k.remainingRequests > 0)
    .sort((a, b) => b.remainingRequests - a.remainingRequests);

  if (available.length === 0) {
    throw new PixabayError(
      "ALL_KEYS_EXHAUSTED",
      "All Pixabay API keys have been rate-limited",
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

const PIXABAY_IMAGE_BASE_URL = env.PIXABAY_API || "https://pixabay.com/api/";
const PIXABAY_VIDEO_BASE_URL = (env.PIXABAY_API || "https://pixabay.com/api/").replace(/\/?$/, "videos/");

async function pixabayRequest<T>(
  baseUrl: string,
  params?: Record<string, string>,
  retryCount = 0,
): Promise<T> {
  loadKeys();

  const apiKey = getNextKey();
  const url = new URL(baseUrl);
  url.searchParams.set("key", apiKey.key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15_000),
  });

  // Track rate limit headers
  const remaining = res.headers.get("X-RateLimit-Remaining");
  if (remaining !== null) {
    apiKey.remainingRequests = parseInt(remaining, 10);
  }
  apiKey.lastUsedAt = Date.now();

  if (res.status === 429) {
    console.warn(
      `[pixabay] Key #${apiKey.index} rate-limited, remaining keys: ${keyPool.filter((k) => k.remainingRequests > 0).length - 1}`,
    );
    apiKey.remainingRequests = 0;
    if (retryCount < keyPool.length - 1) {
      return pixabayRequest<T>(baseUrl, params, retryCount + 1);
    }
    throw new PixabayError(
      "RATE_LIMITED",
      "All Pixabay API keys have been rate-limited",
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new PixabayError(
      "API_ERROR",
      `Pixabay API error: ${res.status} — ${body}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Public API Functions ──────────────────────────────

export async function searchImages(
  query: string,
  options?: {
    lang?: string;
    imageType?: string;
    orientation?: string;
    category?: string;
    minWidth?: number;
    minHeight?: number;
    colors?: string[];
    editorsChoice?: boolean;
    safesearch?: boolean;
    order?: string;
    page?: number;
    perPage?: number;
  },
): Promise<PixabayImageSearchResponse> {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  if (options?.lang) params.lang = options.lang;
  if (options?.imageType) params.image_type = options.imageType;
  if (options?.orientation) params.orientation = options.orientation;
  if (options?.category) params.category = options.category;
  if (options?.minWidth) params.min_width = String(options.minWidth);
  if (options?.minHeight) params.min_height = String(options.minHeight);
  if (options?.colors) params.colors = options.colors.join(",");
  if (options?.editorsChoice) params.editors_choice = "true";
  if (options?.safesearch) params.safesearch = "true";
  if (options?.order) params.order = options.order;
  if (options?.page) params.page = String(options.page);
  if (options?.perPage) params.per_page = String(options.perPage);

  return pixabayRequest<PixabayImageSearchResponse>(
    PIXABAY_IMAGE_BASE_URL,
    params,
  );
}

export async function searchVideos(
  query: string,
  options?: {
    lang?: string;
    videoType?: string;
    category?: string;
    minWidth?: number;
    minHeight?: number;
    editorsChoice?: boolean;
    safesearch?: boolean;
    order?: string;
    page?: number;
    perPage?: number;
  },
): Promise<PixabayVideoSearchResponse> {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  if (options?.lang) params.lang = options.lang;
  if (options?.videoType) params.video_type = options.videoType;
  if (options?.category) params.category = options.category;
  if (options?.minWidth) params.min_width = String(options.minWidth);
  if (options?.minHeight) params.min_height = String(options.minHeight);
  if (options?.editorsChoice) params.editors_choice = "true";
  if (options?.safesearch) params.safesearch = "true";
  if (options?.order) params.order = options.order;
  if (options?.page) params.page = String(options.page);
  if (options?.perPage) params.per_page = String(options.perPage);

  return pixabayRequest<PixabayVideoSearchResponse>(
    PIXABAY_VIDEO_BASE_URL,
    params,
  );
}

export async function getImage(
  id: number,
): Promise<PixabayImage | null> {
  const res = await pixabayRequest<PixabayImageSearchResponse>(
    PIXABAY_IMAGE_BASE_URL,
    { id: String(id) },
  );
  return res.hits[0] ?? null;
}

export async function getVideo(
  id: number,
): Promise<PixabayVideo | null> {
  const res = await pixabayRequest<PixabayVideoSearchResponse>(
    PIXABAY_VIDEO_BASE_URL,
    { id: String(id) },
  );
  return res.hits[0] ?? null;
}

// ─── Helpers ───────────────────────────────────────────

/** Select best available image URL (largest free tier). */
export function selectBestImageUrl(image: PixabayImage): string {
  return image.largeImageURL || image.webformatURL;
}

/**
 * Select best available video size with fallback.
 * Preference: medium → small → tiny → large (large/4K may be empty).
 */
export function selectBestVideoSize(
  videos: PixabayVideo["videos"],
): PixabayVideoSize | null {
  const order: Array<keyof PixabayVideo["videos"]> = [
    "medium",
    "small",
    "tiny",
    "large",
  ];
  for (const key of order) {
    const size = videos[key];
    if (size && size.url) return size;
  }
  return null;
}

export function computeQueryHash(params: {
  query: string;
  mediaType: string;
  imageType?: string;
  videoType?: string;
  orientation?: string;
  category?: string;
  colors?: string;
  order?: string;
  page: number;
  perPage: number;
  schemaVersion?: number;
}): string {
  const normalized = [
    "pixabay",
    params.query.toLowerCase().trim(),
    params.mediaType,
    params.imageType ?? "",
    params.videoType ?? "",
    params.orientation ?? "",
    params.category ?? "",
    params.colors ?? "",
    params.order ?? "",
    String(params.page),
    String(params.perPage),
    String(params.schemaVersion ?? 1),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}
