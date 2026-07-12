/**
 * Material Relevance Scoring Engine
 *
 * Two-tier gate for post-search stock media quality:
 *   Tier 1 (deterministic): keyword intersection check, zero LLM cost.
 *   Tier 2 (LLM batch):     single batched LLM call per query-entry,
 *                            triggers only when Tier 1 yield < DETERMINISTIC_YIELD_THRESHOLD.
 *
 * Abstract fallback: when scored candidates are fewer than needed, fill
 * remaining slots with tone-appropriate generic visuals.
 *
 * Requirements: RSCO-01, RSCO-02, RSCO-03, FBACK-01, FBACK-02
 */

import { LLM_PASS_SCORE } from "@/lib/material-relevance/scoring-constants";
import { scoreLLMBatch } from "@/lib/material-relevance/llm-score";

export { LLM_PASS_SCORE } from "@/lib/material-relevance/scoring-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Subset of CachedPhotoRow fields needed for scoring.
 * The full type lives in route.ts as a local type.
 */
export interface ScorableMediaRow {
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
}

/** A media row augmented with scoring results. */
export interface ScoredMediaRow {
  row: ScorableMediaRow;
  /** 0-100 for deterministic; LLM 0-10 mapped to 0-100 */
  score: number;
  rejected: boolean;
  tier: "deterministic" | "llm";
  rejectionReason?: string;
}

type SafeRole = "product_detail" | "store_environment" | "process";

export interface BusinessContext {
  industry: string | null;
  primaryOffer: string | null;
  targetAudience: string | null;
  /** Output of resolveVisualArchetype() */
  archetype: string;
}

export interface ScoringEntry {
  role: SafeRole;
  query: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** If deterministic acceptance rate < this threshold, trigger LLM batch scoring. */
export const DETERMINISTIC_YIELD_THRESHOLD = 0.5;

/** Nature/landscape terms that signal irrelevance for businesses with specific visual vocabulary. */
const OFF_DOMAIN_TERMS = [
  "mountain",
  "lake",
  "reflection",
  "bird",
  "sky",
  "forest",
  "ocean",
  "beach",
  "sunset",
  "waterfall",
  "canyon",
  "desert",
  "aurora",
  "glacier",
  "volcano",
  "meadow",
];

/** The "generic" archetype — skip off-domain blocklist for this one since any image could be relevant. */
const GENERIC_ARCHETYPE = "professional service business";

// ─── INDUSTRY_ABSTRACT_QUERY_MAP ──────────────────────────────────────────────

/**
 * Maps resolveVisualArchetype() output to tone and role-appropriate abstract
 * fallback search queries. Used when scored candidates are insufficient.
 *
 * 21 entries covering all archetypes defined in route.ts.
 * FBACK-02: "warm" for food/nurturing/crafts, "clean" for professional/clinical/technical.
 */
export const INDUSTRY_ABSTRACT_QUERY_MAP: Record<
  string,
  {
    tone: "warm" | "clean";
    abstractQueries: Record<SafeRole, string>;
  }
> = {
  "HVAC technician air conditioning": {
    tone: "clean",
    abstractQueries: {
      product_detail: "technical equipment close-up clean",
      store_environment: "professional workspace interior minimal",
      process: "technician working professional clean",
    },
  },
  "baker pastry bakery": {
    tone: "warm",
    abstractQueries: {
      product_detail: "warm texture food background soft",
      store_environment: "cozy warm interior bakery cafe",
      process: "handcraft artisan warm light",
    },
  },
  "medical aesthetic beauty treatment": {
    tone: "clean",
    abstractQueries: {
      product_detail: "clean white medical equipment",
      store_environment: "minimal clinic interior white",
      process: "professional beauty treatment calm",
    },
  },
  "carpenter woodwork furniture": {
    tone: "warm",
    abstractQueries: {
      product_detail: "wood grain texture natural close-up",
      store_environment: "workshop interior warm wood",
      process: "craftsman hands working wood",
    },
  },
  "postnatal care newborn": {
    tone: "warm",
    abstractQueries: {
      product_detail: "soft pastel fabric texture gentle",
      store_environment: "warm nursery interior soft",
      process: "gentle care hands soft warm",
    },
  },
  "restaurant kitchen food": {
    tone: "warm",
    abstractQueries: {
      product_detail: "food ingredient texture warm",
      store_environment: "restaurant interior warm dining",
      process: "cooking preparation warm light",
    },
  },
  "fitness gym workout": {
    tone: "clean",
    abstractQueries: {
      product_detail: "sport equipment close-up clean",
      store_environment: "gym interior modern clean",
      process: "athlete motion dynamic clean",
    },
  },
  "auto mechanic car service": {
    tone: "clean",
    abstractQueries: {
      product_detail: "metal tool close-up industrial",
      store_environment: "garage workshop industrial",
      process: "mechanic hands professional work",
    },
  },
  "education classroom training": {
    tone: "clean",
    abstractQueries: {
      product_detail: "books stationery clean minimal",
      store_environment: "classroom interior bright clean",
      process: "student learning focused",
    },
  },
  "retail store merchandise": {
    tone: "warm",
    abstractQueries: {
      product_detail: "product display close-up warm",
      store_environment: "retail interior warm display",
      process: "customer shopping lifestyle",
    },
  },
  "real estate property home": {
    tone: "clean",
    abstractQueries: {
      product_detail: "interior detail clean minimal",
      store_environment: "modern home interior clean",
      process: "professional consultation clean",
    },
  },
  "lawyer legal office consultation": {
    tone: "clean",
    abstractQueries: {
      product_detail: "document paper professional",
      store_environment: "office interior professional clean",
      process: "consultation meeting formal",
    },
  },
  "dentist dental clinic": {
    tone: "clean",
    abstractQueries: {
      product_detail: "medical equipment close-up white",
      store_environment: "clinic interior bright white",
      process: "professional care gentle",
    },
  },
  "hair salon stylist": {
    tone: "warm",
    abstractQueries: {
      product_detail: "hair styling tool close-up warm",
      store_environment: "salon interior warm mirror",
      process: "beauty service caring hands",
    },
  },
  "photography studio portrait": {
    tone: "clean",
    abstractQueries: {
      product_detail: "camera equipment minimal",
      store_environment: "photography studio minimal light",
      process: "creative professional work",
    },
  },
  "pet care veterinary": {
    tone: "warm",
    abstractQueries: {
      product_detail: "soft toy pet supply warm",
      store_environment: "pet care environment warm",
      process: "gentle animal care warm",
    },
  },
  "early childhood daycare": {
    tone: "warm",
    abstractQueries: {
      product_detail: "colorful toy close-up soft",
      store_environment: "children room bright colorful",
      process: "children playing soft warm",
    },
  },
  "home cleaning housekeeping": {
    tone: "clean",
    abstractQueries: {
      product_detail: "cleaning supply close-up fresh",
      store_environment: "clean home interior bright",
      process: "cleaning professional tidy",
    },
  },
  "logistics delivery warehouse": {
    tone: "clean",
    abstractQueries: {
      product_detail: "package box close-up clean",
      store_environment: "warehouse interior organized",
      process: "delivery professional work",
    },
  },
  "florist flower arrangement": {
    tone: "warm",
    abstractQueries: {
      product_detail: "flower petal texture close-up",
      store_environment: "flower shop warm colorful",
      process: "florist hands arrangement",
    },
  },
  "professional service business": {
    tone: "clean",
    abstractQueries: {
      product_detail: "professional tool minimal clean",
      store_environment: "modern office interior clean",
      process: "professional work clean",
    },
  },
};

// ─── Tier 1: Deterministic scoring ───────────────────────────────────────────

/**
 * Deterministic keyword intersection scorer (Tier 1, zero LLM cost).
 *
 * RSCO-01: Rejects rows whose alt text has off-domain nature terms AND zero
 * business keyword overlap. Skips the off-domain check for the generic
 * "professional service business" archetype.
 */
function scoreDeterministic(
  row: ScorableMediaRow,
  businessKeywords: string[],
  archetype: string,
): { score: number; rejected: boolean; rejectionReason?: string } {
  const text = (row.alt ?? "").toLowerCase();

  if (archetype !== GENERIC_ARCHETYPE) {
    // Hard rejection: off-domain nature terms present AND no business keyword overlap
    const hasOffDomain = OFF_DOMAIN_TERMS.some((term) => text.includes(term));
    const businessOverlap = businessKeywords.filter((kw) =>
      text.includes(kw.toLowerCase()),
    ).length;

    if (hasOffDomain && businessOverlap === 0) {
      return {
        score: 0,
        rejected: true,
        rejectionReason: "off-domain nature term, no business keyword overlap",
      };
    }
  }

  // Compute overlap ratio
  const businessOverlap = businessKeywords.filter((kw) =>
    text.includes(kw.toLowerCase()),
  ).length;

  const overlapRatio =
    businessKeywords.length > 0
      ? businessOverlap / businessKeywords.length
      : 0.5; // if no keywords, neutral pass

  return {
    score: Math.round(overlapRatio * 100),
    rejected: false,
  };
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Two-tier media relevance scorer.
 *
 * 1. Run Tier 1 (deterministic) on all rows.
 * 2. If deterministic acceptance rate < DETERMINISTIC_YIELD_THRESHOLD:
 *    Run Tier 2 (LLM batch) on non-rejected rows.
 * 3. Sort accepted results by score descending.
 *
 * RSCO-01, RSCO-02, RSCO-03
 */
export async function scoreAndFilterMedia(
  rows: ScorableMediaRow[],
  context: BusinessContext,
  entry: ScoringEntry,
): Promise<ScoredMediaRow[]> {
  if (rows.length === 0) {
    return [];
  }

  // Derive business keywords from archetype + entry query
  // Filter to words >= 3 chars to remove noise like "a", "of", "at"
  const archetypeWords = context.archetype.split(" ");
  const queryWords = entry.query.split(" ");
  const allWords = [...archetypeWords, ...queryWords]
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3);
  const businessKeywords = [...new Set(allWords)];

  // Tier 1: deterministic scoring on all rows
  const tier1Results: ScoredMediaRow[] = rows.map((row) => {
    const { score, rejected, rejectionReason } = scoreDeterministic(
      row,
      businessKeywords,
      context.archetype,
    );
    return {
      row,
      score,
      rejected,
      tier: "deterministic" as const,
      ...(rejectionReason ? { rejectionReason } : {}),
    };
  });

  // Compute acceptance rate
  const passes = tier1Results.filter((r) => !r.rejected).length;
  const acceptanceRate = passes / rows.length;

  // Tier 2: LLM batch scoring when yield is below threshold
  if (acceptanceRate < DETERMINISTIC_YIELD_THRESHOLD && rows.length > 0) {
    const tier1Rejections = tier1Results.filter((r) => r.rejected);
    const tier1Survivors = tier1Results
      .filter((r) => !r.rejected)
      .map((r) => r.row);

    // Only send non-rejected rows to LLM for re-scoring
    const llmResults = await scoreLLMBatch(tier1Survivors, context, entry);

    const merged = [...tier1Rejections, ...llmResults];
    // Sort accepted by score descending
    return merged.sort((a, b) => {
      if (a.rejected && !b.rejected) return 1;
      if (!a.rejected && b.rejected) return -1;
      return b.score - a.score;
    });
  }

  // Return deterministic results sorted by score descending
  return tier1Results.sort((a, b) => {
    if (a.rejected && !b.rejected) return 1;
    if (!a.rejected && b.rejected) return -1;
    return b.score - a.score;
  });
}

// ─── Abstract fallback ────────────────────────────────────────────────────────

/**
 * Returns tone-appropriate abstract fallback query metadata for a given role + archetype.
 *
 * The caller (route.ts) uses the returned query to call loadMediaFromAllProviders()
 * and marks those results with quality: "generic".
 *
 * FBACK-01, FBACK-02
 */
export function generateAbstractFallbackQueries(
  role: SafeRole,
  archetype: string,
): { query: string; tone: "warm" | "clean" } {
  const entry =
    INDUSTRY_ABSTRACT_QUERY_MAP[archetype] ??
    INDUSTRY_ABSTRACT_QUERY_MAP[GENERIC_ARCHETYPE];

  return {
    query: entry.abstractQueries[role],
    tone: entry.tone,
  };
}
