// ─── Pexels API Raw Response Types ──────────────────────

export interface PexelsPhotoSrc {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  small: string;
  portrait: string;
  landscape: string;
  tiny: string;
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  photographer_id: number;
  avg_color: string;
  src: PexelsPhotoSrc;
  liked: boolean;
  alt: string;
}

export interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

export interface PexelsVideoPicture {
  id: number;
  picture: string;
  nr: number;
}

export interface PexelsVideoUser {
  id: number;
  name: string;
  url: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: PexelsVideoUser;
  video_files: PexelsVideoFile[];
  video_pictures: PexelsVideoPicture[];
}

export interface PexelsPhotoSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

export interface PexelsVideoSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  videos: PexelsVideo[];
  next_page?: string;
}

// ─── Key Rotation Types ────────────────────────────────

export interface PexelsApiKey {
  key: string;
  index: number;
  remainingRequests: number;
  lastUsedAt: number;
}

// ─── Search Types ──────────────────────────────────────

export type PexelsMediaType = "photo" | "video" | "all";
export type PexelsOrientation = "landscape" | "portrait" | "square";
export type PexelsSize = "large" | "medium" | "small";

export interface PexelsSearchParams {
  query: string;
  mediaType: PexelsMediaType;
  orientation?: PexelsOrientation;
  size?: PexelsSize;
  color?: string;
  locale?: string;
  page?: number;
  perPage?: number;
}

export interface PexelsSearchResult {
  id: string;
  pexelsId: number;
  provider: "pexels" | "pixabay";
  mediaType: "photo" | "video";
  width: number;
  height: number;
  url: string;
  photographer: string;
  avgColor: string | null;
  alt: string | null;
  duration: number | null;
  thumbnailUrl: string;
  previewUrl: string;
  ossUrl: string | null;
  ossStatus: string;
  src: PexelsPhotoSrc | null;
  videoFiles: PexelsVideoFile[] | null;
}

export interface PexelsMergedSearchResponse {
  results: PexelsSearchResult[];
  totalResults: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  source: "cache" | "api" | "merged";
}
