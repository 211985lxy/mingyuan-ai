/**
 * 明远 AI+IP 痛点口语意图识别（LLM）。
 *
 * 客户原话 → 锚定 1-2 个痛点 ID，再把意图块与命中条目置顶注入知识上下文。
 * 不做整表灌入：候选目录仅来自项目内已压缩的 customer_pain 条目。
 */
import { LLMClient } from "@/lib/llm/client"
import { prisma } from "@/lib/prisma"
import type { ScoredKnowledgeEntry } from "@/lib/llm/embeddings"

const PAIN_ID_PATTERN = /\bP\d{3}\b/g
const MAX_PAIN_IDS = 2
const CATALOG_ENTRY_LIMIT = 24
const CATALOG_CHAR_BUDGET = 2800

export interface PainPointIntent {
  painIds: string[]
  confidence: number
  reason: string
  matchedTriggers: string[]
  intentBlock: string
  pinnedEntries: ScoredKnowledgeEntry[]
}

type PainCatalogRow = {
  id: string
  title: string
  content: string
  category: string
  tags: unknown
  valueGrade: string | null
  painId: string
  triggerLine: string
  summaryLine: string
}

function clip(text: string, max: number) {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`
}

function extractPainId(title: string): string | null {
  const match = title.match(/\bP\d{3}\b/)
  return match?.[0] ?? null
}

function extractTriggerLine(content: string): string {
  const line = content
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith("客户口语触发词：") || part.startsWith("触发：") || part.includes("触发词"))
  if (!line) return ""
  return clip(line.replace(/^客户口语触发词：/, "").replace(/^触发：/, ""), 120)
}

function extractSummaryLine(content: string): string {
  const painLine = content
    .split("\n")
    .map((part) => part.trim())
    .find((part) => part.startsWith("痛点："))
  if (painLine) return clip(painLine.replace(/^痛点：/, ""), 80)
  return clip(content.replace(/\s+/g, " "), 80)
}

/**
 * @description 从项目知识库加载压缩痛点目录（供 LLM 意图识别）
 */
export async function loadPainPointCatalog(projectId: string): Promise<PainCatalogRow[]> {
  const rows = await prisma.knowledgeEntry.findMany({
    where: {
      projectId,
      status: "active",
      category: "customer_pain",
      OR: [
        { title: { startsWith: "P" } },
        { title: { contains: "口语触发词" } },
        { title: { contains: "痛点口语" } },
      ],
    },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      valueGrade: true,
    },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: CATALOG_ENTRY_LIMIT,
  })

  const catalog: PainCatalogRow[] = []
  for (const row of rows) {
    const painId = extractPainId(row.title) || (row.title.includes("索引") ? "INDEX" : "")
    if (!painId || painId === "INDEX") continue
    catalog.push({
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      tags: row.tags,
      valueGrade: row.valueGrade,
      painId,
      triggerLine: extractTriggerLine(row.content),
      summaryLine: extractSummaryLine(row.content),
    })
  }
  return catalog
}

function formatCatalogForPrompt(catalog: PainCatalogRow[]): string {
  const lines: string[] = []
  let used = 0
  for (const row of catalog) {
    const line = `${row.painId}｜触发：${row.triggerLine || "（见摘要）"}｜痛点：${row.summaryLine}`
    if (used + line.length + 1 > CATALOG_CHAR_BUDGET) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.join("\n")
}

function parsePainIntentJson(raw: string): {
  painIds: string[]
  confidence: number
  reason: string
  matchedTriggers: string[]
} | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const painIds = Array.isArray(parsed.painIds)
      ? parsed.painIds.map(String).map((id) => id.trim().toUpperCase()).filter((id) => /^P\d{3}$/.test(id))
      : []
    const matchedTriggers = Array.isArray(parsed.matchedTriggers)
      ? parsed.matchedTriggers.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 6)
      : []
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : ""
    return { painIds: [...new Set(painIds)].slice(0, MAX_PAIN_IDS), confidence, reason, matchedTriggers }
  } catch {
    return null
  }
}

/**
 * 规则快路径：用户已显式写出 P001 / 痛点ID：P011 时，跳过 LLM。
 */
export function extractExplicitPainIds(userText: string): string[] {
  const ids = userText.toUpperCase().match(PAIN_ID_PATTERN) || []
  return [...new Set(ids)].slice(0, MAX_PAIN_IDS)
}

async function classifyPainIntentWithLlm(input: {
  userText: string
  catalogText: string
}): Promise<{
  painIds: string[]
  confidence: number
  reason: string
  matchedTriggers: string[]
} | null> {
  const prompt = [
    "你是明远 AI+IP 获客脚本的痛点意图识别器。只输出 JSON。",
    "任务：根据用户/客户原话，从目录中选出最匹配的 0-2 个痛点 ID。",
    "规则：",
    "1. 口语、语义相近即可命中，不必原词完全一致。",
    "2. 默认只选 1 个；确需组合时最多 2 个，且必须同场景/同角色。",
    "3. 没有明确痛点信号时返回空数组，禁止硬套。",
    "4. 禁止编造目录外的痛点 ID。",
    "5. confidence 为 0-1；reason 一句话说明为什么选这些。",
    "",
    `用户原话：${clip(input.userText, 800)}`,
    "",
    "痛点目录：",
    input.catalogText || "（空）",
    "",
    '输出格式：{"painIds":["P001"],"confidence":0.0,"reason":"一句话","matchedTriggers":["触发词"]}',
  ].join("\n")

  try {
    const completion = await LLMClient.shared().complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 280,
      responseFormat: { type: "json_object" },
    })
    return parsePainIntentJson(completion.content)
  } catch {
    return null
  }
}

function buildIntentBlock(input: {
  painIds: string[]
  reason: string
  matchedTriggers: string[]
  confidence: number
  pinned: PainCatalogRow[]
}): string {
  if (input.painIds.length === 0) return ""
  const detail = input.pinned
    .map((row) => `- ${row.painId}：${row.summaryLine}${row.triggerLine ? `（触发：${row.triggerLine}）` : ""}`)
    .join("\n")
  return [
    "=== 痛点意图识别（LLM）===",
    `锚定痛点：${input.painIds.join("、")}`,
    `置信度：${input.confidence.toFixed(2)}`,
    `判定：${input.reason || "根据用户原话锚定"}`,
    input.matchedTriggers.length ? `命中触发：${input.matchedTriggers.join("、")}` : "",
    "执行要求：本稿只围绕上述痛点展开；开头可扩大入口，中段回到该痛点角色/场景筛人；转化钩子必须承接该痛点下一步；禁止另造核心痛点。",
    detail ? `痛点摘要：\n${detail}` : "",
  ].filter(Boolean).join("\n")
}

/**
 * @description 解析用户原话对应的痛点意图（显式 ID 优先，否则 LLM）
 */
export async function resolvePainPointIntent(input: {
  projectId: string
  userText: string
}): Promise<PainPointIntent | null> {
  const userText = input.userText.trim()
  if (!input.projectId || userText.length < 4) return null

  const catalog = await loadPainPointCatalog(input.projectId)
  if (catalog.length === 0) return null

  const catalogById = new Map(catalog.map((row) => [row.painId, row]))
  const explicit = extractExplicitPainIds(userText).filter((id) => catalogById.has(id))

  let painIds = explicit
  let confidence = explicit.length ? 0.95 : 0
  let reason = explicit.length ? `用户显式指定 ${explicit.join("、")}` : ""
  let matchedTriggers: string[] = []

  if (painIds.length === 0) {
    const classified = await classifyPainIntentWithLlm({
      userText,
      catalogText: formatCatalogForPrompt(catalog),
    })
    if (!classified) return null
    painIds = classified.painIds.filter((id) => catalogById.has(id))
    confidence = classified.confidence
    reason = classified.reason
    matchedTriggers = classified.matchedTriggers
  }

  // 低置信且无显式 ID：不强制锚定，避免误伤
  if (painIds.length === 0 || (explicit.length === 0 && confidence < 0.45)) {
    return {
      painIds: [],
      confidence,
      reason: reason || "未识别到明确痛点",
      matchedTriggers,
      intentBlock: "",
      pinnedEntries: [],
    }
  }

  const pinnedRows: PainCatalogRow[] = []
  for (const id of painIds) {
    const row = catalogById.get(id)
    if (row) pinnedRows.push(row)
  }

  const pinnedEntries: ScoredKnowledgeEntry[] = pinnedRows.map((row, index) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: row.tags,
    valueGrade: row.valueGrade,
    score: 1.5 - index * 0.05,
  }))

  return {
    painIds,
    confidence,
    reason,
    matchedTriggers,
    intentBlock: buildIntentBlock({
      painIds,
      reason,
      matchedTriggers,
      confidence,
      pinned: pinnedRows,
    }),
    pinnedEntries,
  }
}

/**
 * 把痛点意图置顶合并进知识上下文（去重 + 意图块前置）。
 */
export function mergePainIntentIntoKnowledgeContext(input: {
  knowledgeBlock: string
  entries: ScoredKnowledgeEntry[]
  intent: PainPointIntent | null | undefined
}): { knowledgeBlock: string; entries: ScoredKnowledgeEntry[] } {
  if (!input.intent || input.intent.painIds.length === 0 || !input.intent.intentBlock) {
    return { knowledgeBlock: input.knowledgeBlock, entries: input.entries }
  }

  const pinnedIds = new Set(input.intent.pinnedEntries.map((entry) => entry.id))
  const rest = input.entries.filter((entry) => !pinnedIds.has(entry.id))
  const entries = [...input.intent.pinnedEntries, ...rest]
  const knowledgeBlock = `${input.intent.intentBlock}\n\n${input.knowledgeBlock}`.trim()
  return { knowledgeBlock, entries }
}

/**
 * 用识别到的痛点增强检索 query，提高后续 RAG 命中率。
 */
export function enrichKnowledgeQueryWithPainIntent(query: string, intent: PainPointIntent | null | undefined): string {
  if (!intent || intent.painIds.length === 0) return query
  const triggerHint = intent.matchedTriggers.length
    ? `触发词：${intent.matchedTriggers.join("、")}`
    : ""
  return [query.trim(), `锚定痛点：${intent.painIds.join("、")}`, intent.reason, triggerHint]
    .filter(Boolean)
    .join("\n")
}
