import { generateAbstractFallbackQueries, scoreAndFilterMedia } from "@/lib/material-relevance"
import type { MaterialAssignment, PackagingMaterialSource } from "@/types/api"
import type { CachedPhotoRow, SearchPlanEntry, SearchPlanResult } from "./contracts"
import { loadMediaFromAllProviders } from "./pexels-videos"
import { getPhotoPreviewUrls, getVideoPreviewUrls } from "./preview"

type ScoringContext = Parameters<typeof scoreAndFilterMedia>[1];

function appendRows(input: {
  suggestions: MaterialAssignment[]; seenIds: Set<string>; rows: CachedPhotoRow[];
  entry: SearchPlanEntry; query: string; quality: "matched" | "generic"; limit: number;
}): number {
  let collected = 0;
  for (const row of input.rows) {
    const uniqueKey = `${row.provider}:${row.pexelsId}`;
    if (input.seenIds.has(uniqueKey)) continue;
    input.seenIds.add(uniqueKey);
    const urls = input.entry.mediaType === "video" ? getVideoPreviewUrls(row) : getPhotoPreviewUrls(row);
    const source: PackagingMaterialSource = row.provider === "pixabay" ? "ai_pixabay" : "ai_pexels";
    input.suggestions.push({
      role: input.entry.role, type: input.entry.mediaType, fileUrl: urls.fileUrl, source,
      pexelsId: row.pexelsId, searchQuery: input.query, thumbnailUrl: urls.thumbnailUrl,
      previewUrl: urls.previewUrl, ossStatus: row.ossStatus === "ready" ? "ready" : "pending", quality: input.quality,
    });
    collected += 1;
    if (collected >= input.limit) break;
  }
  return collected;
}

async function collectEntry(input: {
  entry: SearchPlanEntry; suggestions: MaterialAssignment[]; seenIds: Set<string>;
  archetype: string; scoringContext: ScoringContext;
}): Promise<void> {
  const rows = await loadMediaFromAllProviders(input.entry.query, input.entry.mediaType, Math.max(4, input.entry.count * 3));
  const scored = await scoreAndFilterMedia(rows, input.scoringContext, { role: input.entry.role, query: input.entry.query });
  const collected = appendRows({
    ...input, rows: scored.filter((candidate) => !candidate.rejected).map((candidate) => candidate.row),
    query: input.entry.query, quality: "matched", limit: input.entry.count,
  });
  if (collected >= input.entry.count) return;

  const remaining = input.entry.count - collected;
  const { query } = generateAbstractFallbackQueries(input.entry.role, input.archetype);
  const fallbackRows = await loadMediaFromAllProviders(query, input.entry.mediaType, Math.max(4, remaining * 2));
  appendRows({ ...input, rows: fallbackRows, query, quality: "generic", limit: remaining });
}

export async function collectMaterialSuggestions(input: {
  searchPlan: SearchPlanResult; archetype: string; scoringContext: ScoringContext;
}): Promise<MaterialAssignment[]> {
  const suggestions: MaterialAssignment[] = [];
  const seenIds = new Set<string>();
  for (const entry of input.searchPlan.queries) {
    await collectEntry({ ...input, entry, suggestions, seenIds });
  }
  return suggestions;
}
