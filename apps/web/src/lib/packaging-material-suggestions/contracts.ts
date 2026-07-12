import { SAFE_AI_MATERIAL_ROLES } from "@/lib/packaging-materials"
import type { MaterialAssignment } from "@/types/api"
import { env } from "@/env"

export const MATERIAL_PLAN_MODEL =
  env.PACKAGING_MATERIAL_PLAN_MODEL || "openai/gpt-5-mini";
export const INDUSTRY_INFER_MODEL =
  env.PACKAGING_MATERIAL_PLAN_MODEL || "openai/gpt-5-mini";
export const SEARCH_LOCALE = "en-US";
export const SEARCH_ORIENTATION = "landscape";
export const SEARCH_SIZE = "large";

/**
 * Cache schema version — increment when query strategy or scoring logic changes.
 * Baked into computeQueryHash so old cache entries become automatic misses.
 * v1: Pre-scoring era (Phase 1-2)
 * v2: Phase 3 relevance scoring deployed — all v1 entries auto-invalidated
 */
export const CACHE_SCHEMA_VERSION = 2;

export type SafeRole = (typeof SAFE_AI_MATERIAL_ROLES)[number];

export interface SearchPlanEntry {
  role: SafeRole;
  mediaType: "image" | "video";
  query: string;
  count: number;
}

export interface SearchPlanResult {
  source: "llm" | "deterministic" | "abstract_fallback";
  queries: SearchPlanEntry[];
}

export interface SearchPlanInput {
  existingItems: MaterialAssignment[];
  maxCount: number;
  packagingTemplateName: string;
  scriptContent: string;
  ipProfileSnapshot: string;
  preferredRoles?: SafeRole[];
  industry?: string | null;
  primaryOffer?: string | null;
  targetAudience?: string | null;
}

export interface InferredIndustry {
  industry: string;
  archetype: string;
}

export type CachedPhotoRow = {
  id: string;
  pexelsId: number;
  provider: "pexels" | "pixabay";
  mediaType: "photo" | "video";
  url: string;
  alt: string | null;
  imageUrl: string | null;
  srcJson: unknown;
  videoFilesJson: unknown;
  videoPicturesJson: unknown;
  ossUrl: string | null;
  ossStatus: string;
};
