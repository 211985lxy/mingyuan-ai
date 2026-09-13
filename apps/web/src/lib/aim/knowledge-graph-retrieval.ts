/**
 * 知识图谱扩展检索（WP-A5 第二步）。
 *
 * 背景：图谱（KnowledgeEntity/KnowledgeRelation）一直在建——`extractAndPersistForEntry`
 * 挂在知识新增链路上，生产已有 127 实体 / 104 关系——但**从不被检索消费**：
 * `retrieveEntityContext` 没有任何调用方。本模块把图谱接进检索：
 * 向量 topK 之后按查询命中的实体做一跳邻域扩展，补齐纯向量漏掉的相关条目。
 *
 * 灰度：`AIM_KNOWLEDGE_GRAPH_ENABLED` 默认关。先用基线 CLI 的 --graph 量化
 * 提升幅度（闸门：hitRate@k 相对提升 ≥10% 才继续投入），达标后再开会放量。
 */

import { retrieveEntityContext } from "@/lib/knowledge-entity-extractor"
import { retrieveRelevantKnowledge, type ScoredKnowledgeEntry } from "@/lib/llm/embeddings"

/** 图扩展最多补几条——宁少勿多，避免上下文被"语义远但实体近"的条目挤占。 */
export const GRAPH_EXPANSION_BUDGET = 4

export interface GraphAwareRetrievalInput {
  userId: string
  projectId: string
  query: string
  topicTitle?: string
  topicRationale?: string
  topK: number
  prefilter?: { categories?: string[]; valueGrades?: string[] }
  /** 是否启用图扩展；默认读灰度开关 */
  graphEnabled?: boolean
}

export interface GraphAwareRetrievalResult {
  entries: ScoredKnowledgeEntry[]
  source: "embedding" | "raw"
  /** 本次由图扩展补进来的条目数（0 表示无增量，便于打点与闸门评估） */
  graphAdded: number
}

export function isKnowledgeGraphEnabled(): boolean {
  return process.env.AIM_KNOWLEDGE_GRAPH_ENABLED === "true"
}

/**
 * 合并图扩展结果：向量结果保持原顺序与分数（排序语义不变），
 * 图补条目**追加在后**并给一个略低于向量最低分的分数——它们的作用是"召回补强"，
 * 不参与"谁更相关"的竞争，避免用人工规则覆盖语义排序。
 */
export function mergeGraphEntries(
  vectorEntries: ScoredKnowledgeEntry[],
  graphEntries: Array<{ id: string; title: string; content: string; category: string; tags: unknown; valueGrade: string | null }>,
  budget: number = GRAPH_EXPANSION_BUDGET,
): { entries: ScoredKnowledgeEntry[]; added: number } {
  const seen = new Set(vectorEntries.map((entry) => entry.id))
  const floor = vectorEntries.length > 0
    ? Math.min(...vectorEntries.map((entry) => entry.score))
    : 0
  const additions: ScoredKnowledgeEntry[] = []
  for (const entry of graphEntries) {
    if (additions.length >= budget) break
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    additions.push({
      id: entry.id,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      tags: entry.tags,
      valueGrade: entry.valueGrade,
      // 略低于向量最低分：保证排序稳定性与"补强"语义
      score: floor - 0.001 * (additions.length + 1),
    })
  }
  return { entries: [...vectorEntries, ...additions], added: additions.length }
}

export async function retrieveKnowledgeWithGraph(
  input: GraphAwareRetrievalInput,
): Promise<GraphAwareRetrievalResult> {
  const vector = await retrieveRelevantKnowledge({
    userId: input.userId,
    projectId: input.projectId,
    query: input.query,
    topicTitle: input.topicTitle,
    topicRationale: input.topicRationale,
    topK: input.topK,
    prefilter: input.prefilter,
  })

  const enabled = input.graphEnabled ?? isKnowledgeGraphEnabled()
  if (!enabled) {
    return { entries: vector.entries, source: vector.source, graphAdded: 0 }
  }

  // 图扩展失败不得影响主检索（图谱是补强，不是依赖）。
  const graphEntries = await retrieveEntityContext({
    userId: input.userId,
    projectId: input.projectId,
    query: [input.query, input.topicTitle, input.topicRationale].filter(Boolean).join(" "),
    topK: GRAPH_EXPANSION_BUDGET,
  }).catch(() => [])

  const merged = mergeGraphEntries(vector.entries, graphEntries)
  return { entries: merged.entries, source: vector.source, graphAdded: merged.added }
}
