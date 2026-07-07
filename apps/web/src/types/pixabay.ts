// ─── Pixabay API Raw Response Types ──────────────────────

export interface PixabayImage {
  id: number;
  pageURL: string;
  type: string; // "photo" | "illustration" | "vector"
  tags: string; // comma-separated
  previewURL: string; // max 150px w/h
  previewWidth: number;
  previewHeight: number;
  webformatURL: string; // max 640px, valid 24h
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string; // max 1280px long side
  views: number;
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string; // 250x250
  // premium-only fields
  fullHDURL?: string; // max 1920px
  imageURL?: string; // original resolution
  vectorURL?: string; // SVG/AI (vectors only)
}

export interface PixabayVideoSize {
  url: string; // append ?download=1 to trigger download
  width: number;
  height: number;
  size: number; // approximate bytes
  thumbnail: string;
}

export interface PixabayVideo {
  id: number;
  pageURL: string;
  type: string; // "film" | "animation"
  tags: string; // comma-separated
  duration: number; // seconds
  videos: {
    large: PixabayVideoSize; // 3840x2160, may be empty
    medium: PixabayVideoSize; // 1920x1080
    small: PixabayVideoSize; // 1280x720
    tiny: PixabayVideoSize; // 960x540
  };
  views: number;
  downloads: number;
  likes: number;
  comments: number;
  user_id: number;
  user: string;
  userImageURL: string;
}

export interface PixabaySearchResponse<T> {
  total: number; // actual total matches
  totalHits: number; // max 500 accessible
  hits: T[];
}

export type PixabayImageSearchResponse = PixabaySearchResponse<PixabayImage>;
export type PixabayVideoSearchResponse = PixabaySearchResponse<PixabayVideo>;

// ─── Key Rotation Types ────────────────────────────────

export interface PixabayApiKey {
  key: string;
  index: number;
  remainingRequests: number;
  lastUsedAt: number;
}

// ─── Search Filter Types ───────────────────────────────

export type PixabayImageType = "all" | "photo" | "illustration" | "vector";
export type PixabayVideoType = "all" | "film" | "animation";
export type PixabayOrientation = "all" | "horizontal" | "vertical";
export type PixabayOrder = "popular" | "latest";

export type PixabayCategory =
  | "backgrounds"
  | "fashion"
  | "nature"
  | "science"
  | "education"
  | "feelings"
  | "health"
  | "people"
  | "religion"
  | "places"
  | "animals"
  | "industry"
  | "computer"
  | "food"
  | "sports"
  | "transportation"
  | "travel"
  | "buildings"
  | "business"
  | "music";

export type PixabayColor =
  | "grayscale"
  | "transparent"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "turquoise"
  | "blue"
  | "lilac"
  | "pink"
  | "white"
  | "gray"
  | "black"
  | "brown";

export type PixabayLang =
  | "cs" | "da" | "de" | "en" | "es" | "fr" | "id" | "it"
  | "hu" | "nl" | "no" | "pl" | "pt" | "ro" | "sk" | "fi"
  | "sv" | "tr" | "vi" | "th" | "bg" | "ru" | "el" | "ja"
  | "ko" | "zh";

export interface PixabayImageSearchParams {
  query: string;
  lang?: PixabayLang;
  imageType?: PixabayImageType;
  orientation?: PixabayOrientation;
  category?: PixabayCategory;
  minWidth?: number;
  minHeight?: number;
  colors?: PixabayColor[];
  editorsChoice?: boolean;
  safesearch?: boolean;
  order?: PixabayOrder;
  page?: number;
  perPage?: number;
}

export interface PixabayVideoSearchParams {
  query: string;
  lang?: PixabayLang;
  videoType?: PixabayVideoType;
  category?: PixabayCategory;
  minWidth?: number;
  minHeight?: number;
  editorsChoice?: boolean;
  safesearch?: boolean;
  order?: PixabayOrder;
  page?: number;
  perPage?: number;
}
