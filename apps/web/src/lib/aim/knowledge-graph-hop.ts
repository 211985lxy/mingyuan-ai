import { env } from "@/env"
import { retrieveEntityContext, type EntityContextEntry } from "@/lib/knowledge-entity-extractor"
import type { ScoredKnowledgeEntry } from "@/lib/llm/embeddings"

export function graphHopEnabled(): boolean {
  return env.AIM_KNOWLEDGE_GRAPH_HOP_ENABLED?.trim().toLowerCase() !== "false"
}

export function mergeVectorWithGraphHop<T extends { id: string; score: number }>(
  vectorHits: T[],
  graphHits: Array<{ id: string; score: number }>,
  limit: number,
): T[] {
  const merged = new Map<string, T>()
  for (const hit of vectorHits) merged.set(hit.id, hit)
  for (const hit of graphHits) {
    const existing = merged.get(hit.id)
    if (existing) {
      existing.score = Math.max(existing.score, hit.score)
    }
  }
  const extras = graphHits.filter((hit) => !merged.has(hit.id))
  const vectorAsT = vectorHits
  const extraAsT = extras as unknown as T[]
  return [...vectorAsT, ...extraAsT]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function loadGraphHopEntries(input: {
  projectId?: string | null
  query: string
  topK?: number
}): Promise<EntityContextEntry[]> {
  if (!graphHopEnabled()) return []
  return retrieveEntityContext(input)
}

export function toScoredKnowledge(entry: EntityContextEntry): ScoredKnowledgeEntry {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    category: entry.category,
    tags: entry.tags,
    valueGrade: entry.valueGrade,
    score: entry.score,
  } as ScoredKnowledgeEntry
}
