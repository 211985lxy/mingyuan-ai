import { retrieveRelevantKnowledge, ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import type { ScoredKnowledgeEntry } from "@/lib/llm/embeddings"
import { parseKnowledgeTags, normalizeValueGrade } from "@/lib/knowledge-tags"
import {
  type ResolvedKnowledgeStrategy,
  getStrategyProfile,
} from "@/lib/aim-knowledge-strategy"
import { CATEGORY_LABELS } from "@/lib/knowledge-categories"

// ─── 类型定义 ──────────────────────────────────────────────

export interface AimKnowledgeContextInput {
  userId: string
  projectId: string
  agentId: string
  query: string
  topicTitle?: string
  topicRationale?: string
  /** 知识调用策略，默认 deep（=改造前行为，保证向后兼容） */
  strategy?: ResolvedKnowledgeStrategy
}

export interface AimKnowledgeContextResult {
  knowledgeBlock: string
  entries: ScoredKnowledgeEntry[]
  source: "embedding" | "raw"
}

// ─── 常量 ──────────────────────────────────────────────────

/**
 * 智能体分类优先级（影响排序但不过滤）
 * 按语义搜索得分排序后，每类知识：
 * - 命中的优先级分类 → 得分 × 1.15（优先靠前）
 * - 其余 → 得分 × 0.85（后移）
 * 保留所有类别，避免信息缺失。
 */
const AGENT_PRIORITY_CATEGORIES: Record<string, string[]> = {
  deep_copywriter: [
    "boss_experience",
    "product_usp",
    "user_insight",
    "benchmark_reference",
    "positioning_material",
  ],
  business_system_diagnosis: [
    "product_usp",
    "customer_pain",
    "project_case",
    "customer_qa",
    "user_insight",
  ],
  business_diagnosis: [
    "user_insight",
    "positioning_material",
    "boss_experience",
    "product_usp",
    "customer_pain",
  ],
  content_producer: [
    "user_insight",
    "product_usp",
    "project_case",
    "private_domain_material",
    "hot_topic",
    "benchmark_reference",
  ],
  content_review: [
    "project_case",
    "benchmark_reference",
    "user_insight",
    "hot_topic",
  ],
}

/** 默认优先级（未匹配到具体 agent 时的兜底） */
const DEFAULT_PRIORITY_CATEGORIES = [
  "product_usp",
  "boss_experience",
  "customer_pain",
  "project_case",
]

/**
 * 价值分级权重（S/A/B/C），与 confidence(真不真) 正交，管"重不重要"。
 * null / 未知等级 → 视为 B(×1.0)，与改造前行为一致，保证零回归。
 * 与策略档叠加：策略档决定调几条，分级决定调哪条优先。
 */
const GRADE_WEIGHT: Record<string, number> = {
  S: 1.3, // 战略级：改变认知，优先浮出
  A: 1.15, // 战术级：可复用方法
  B: 1.0, // 参考级（默认）
  C: 0.7, // 索引级：轻量参与、靠后
}

// ─── 截断函数 ──────────────────────────────────────────────

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + "..."
}

// ─── 公开函数 ──────────────────────────────────────────────

/**
 * 把策略的 categoryBoost 字典转成检索预过滤白名单。
 * 只取权重 > 1 的类别（被策略"加权"的才进白名单）。
 * deep 档 categoryBoost 为空 → 返回 [] → 上层不传 prefilter → 退化为全量（向后兼容）。
 */
export function categoriesFromBoost(categoryBoost: Record<string, number>): string[] {
  return Object.entries(categoryBoost)
    .filter(([, w]) => w > 1)
    .map(([c]) => c)
}

/**
 * 构建知识上下文块
 *
 * 统一 AIM 知识检索入口，对所有智能体共用同一条上下文构建链路。
 * 内部步骤：
 * 1. 调用 retrieveRelevantKnowledge() 语义检索
 * 2. 按 agentId 优先级做轻量重排
 * 3. 截断超长条目
 * 4. 拼接成知识块字符串（不超过预算）
 *
 * Embedding 不可用时自动回退到项目级 fallback。
 */
export async function buildAimKnowledgeContext(
  input: AimKnowledgeContextInput
): Promise<AimKnowledgeContextResult> {
  const { userId, projectId, agentId, query, topicTitle, topicRationale } = input

  // 策略画像决定本次调用量与侧重（默认 deep = 改造前行为）
  const profile = getStrategyProfile(input.strategy ?? "deep")

  // 把策略加权的类别转成检索预过滤白名单，下推到 SQL 缩窄候选
  const boostCategories = categoriesFromBoost(profile.categoryBoost)

  // 1. 语义检索
  const retrieved = await retrieveRelevantKnowledge({
    userId,
    projectId,
    query,
    topicTitle,
    topicRationale,
    topK: profile.topK,
    prefilter: boostCategories.length > 0 ? { categories: boostCategories } : undefined,
  })

  let entries = retrieved.entries

  // 2. 按智能体分类优先级、策略分类权重和清洗标签重排（仅影响排序，不过滤）
  entries = rankKnowledgeEntriesForAgent(agentId, entries, profile.categoryBoost)

  // 3. 截断超长条目
  const needTruncation = entries.some((e) => e.content.length > profile.maxEntryChars)
  if (needTruncation) {
    entries = entries.map((e) => ({
      ...e,
      content: truncateContent(e.content, profile.maxEntryChars),
    }))
  }

  // 4. 拼接知识块，控制总字符预算
  const knowledgeBlock = buildKnowledgeBlockWithBudget(entries, profile.maxBlockChars)

  return {
    knowledgeBlock,
    entries,
    source: retrieved.source,
  }
}

/**
 * 构建知识块（共享，替代 aim-tool-actions 和 aim-generator 中的重复实现）
 *
 * @param maxChars 总字符上限，超出则跳过后续知识
 */
export function buildKnowledgeBlock(
  entries: Array<{ category: string; title: string; content: string; tags?: unknown; valueGrade?: string | null }>
): string {
  return buildKnowledgeBlockWithBudget(entries, Infinity)
}

export function rankKnowledgeEntriesForAgent<T extends { category: string; score: number; tags?: unknown; valueGrade?: string | null }>(
  agentId: string,
  entries: T[],
  categoryBoost: Record<string, number> = {},
): T[] {
  if (entries.length === 0) return entries

  const prioritySet = new Set(
    AGENT_PRIORITY_CATEGORIES[agentId] ?? DEFAULT_PRIORITY_CATEGORIES
  )
  const wantsIp = agentId === "deep_copywriter" || agentId === "business_diagnosis"
  const wantsProject = agentId === "content_producer" || agentId === "business_system_diagnosis" || agentId === "content_review"

  return entries
    .map((entry) => {
      const parsed = parseKnowledgeTags(entry.tags)
      let score = prioritySet.has(entry.category) ? entry.score * 1.15 : entry.score * 0.85
      if (wantsIp && parsed.scope === "ip") score *= 1.2
      if (wantsProject && parsed.scope === "project") score *= 1.2
      if (entry.category === "user_insight" && parsed.assetRole === "strategy") score *= 1.35
      // 策略级分类权重叠加（hot_topic 突出热点/对标、conversion 突出卖点/痛点等）
      if (categoryBoost[entry.category]) score *= categoryBoost[entry.category]
      // 价值分级权重：S/A 优先浮出，C 靠后；null 视为 B(×1.0)
      score *= GRADE_WEIGHT[normalizeValueGrade(entry.valueGrade) ?? "B"]
      return { entry, score }
    })
    .sort((a, b) => b.score - a.score)
    .map(({ entry, score }) => ({ ...entry, score }))
}

function buildKnowledgeBlockWithBudget(
  entries: Array<{ category: string; title: string; content: string; tags?: unknown; valueGrade?: string | null }>,
  maxChars: number
): string {
  if (entries.length === 0) return ""

  const grouped = new Map<string, typeof entries>()
  for (const entry of entries) {
    const list = grouped.get(entry.category) || []
    list.push(entry)
    grouped.set(entry.category, list)
  }

  let block = "\n\n=== 企业知识库 ===\n"
  let totalChars = block.length

  for (const [category, items] of grouped) {
    let categoryBlock = `\n【${CATEGORY_LABELS[category] || category}】\n`
    for (const item of items) {
      const parsed = parseKnowledgeTags(item.tags)
      // 等级前缀：仅显式标注 S/A/C 时展示（B 是默认，省略避免噪声）
      const grade = normalizeValueGrade(item.valueGrade)
      const gradePrefix = grade && grade !== "B" ? `[${grade}] ` : ""
      const title = parsed.confidence === "pending_verify"
        ? `${gradePrefix}${item.title}（待核验）`
        : `${gradePrefix}${item.title}`
      const entryLine = `- ${title}：${item.content}\n`
      categoryBlock += entryLine
    }

    // 如果加入本分类会超出预算，跳过剩余知识
    if (totalChars + categoryBlock.length > maxChars) {
      // 只记录一条提示
      const remaining = entries.length - items.length - [...grouped.keys()].indexOf(category)
      if (remaining > 0 && block.length < maxChars) {
        block += `\n（剩余 ${remaining} 条知识已跳过，达到上下文预算上限）\n`
      }
      break
    }

    block += categoryBlock
    totalChars += categoryBlock.length
  }

  return block
}

/**
 * 触发 embedding 后置更新（Fire-and-forget）
 */
export function fireKnowledgeEmbedding(entries: Array<{ id: string }>, source: string): void {
  if (source === "raw") {
    for (const entry of entries) {
      ensureKnowledgeEmbedding(entry.id).catch(() => {})
    }
  }
}
