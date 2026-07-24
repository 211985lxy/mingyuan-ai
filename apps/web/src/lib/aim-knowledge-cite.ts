/**
 * 文案生成「相关原文」引用：结构化 knowledgeUsed + 思考依据小节。
 * 权威来源是本次 retrievedEntries，不依赖模型编造。
 */
import { CATEGORY_LABELS } from "@/lib/knowledge-categories"

export const KNOWLEDGE_CITE_SNIPPET_CHARS = 120
export const KNOWLEDGE_CITE_MAX_ENTRIES = 8

export interface AimKnowledgeUsedRef {
  id: string
  title: string
  category: string
  /** 中文分类名，如「产品卖点」；历史数据可能缺失 */
  categoryLabel?: string
  /** 正文前缀摘要，供列表预览；历史数据可能缺失 */
  snippet?: string
}

type CiteSourceEntry = {
  id: string
  title: string
  category: string
  content?: string | null
}

function clipSnippet(content: string | null | undefined, max = KNOWLEDGE_CITE_SNIPPET_CHARS): string {
  const trimmed = String(content ?? "").replace(/\s+/g, " ").trim()
  if (!trimmed) return ""
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1))}…`
}

export function knowledgeCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category
}

/**
 * 将召回条目映射为可持久化 / 可展示的引用结构。
 */
export function mapEntriesToKnowledgeUsed(entries: CiteSourceEntry[]): AimKnowledgeUsedRef[] {
  const seen = new Set<string>()
  const result: AimKnowledgeUsedRef[] = []
  for (const entry of entries) {
    if (!entry?.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    const snippet = clipSnippet(entry.content)
    result.push({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      categoryLabel: knowledgeCategoryLabel(entry.category),
      ...(snippet ? { snippet } : {}),
    })
  }
  return result
}

/**
 * 兼容历史 JSON：只保证 id/title/category，可选补齐 label。
 */
export function normalizeKnowledgeUsed(raw: unknown): AimKnowledgeUsedRef[] {
  if (!Array.isArray(raw)) return []
  const result: AimKnowledgeUsedRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    if (typeof record.id !== "string" || !record.id) continue
    const title = typeof record.title === "string" ? record.title : ""
    const category = typeof record.category === "string" ? record.category : ""
    const categoryLabel =
      typeof record.categoryLabel === "string" && record.categoryLabel.trim()
        ? record.categoryLabel.trim()
        : knowledgeCategoryLabel(category)
    const snippet = typeof record.snippet === "string" ? clipSnippet(record.snippet) : undefined
    result.push({
      id: record.id,
      title,
      category,
      categoryLabel,
      ...(snippet ? { snippet } : {}),
    })
  }
  return result
}

/**
 * 思考依据里的「### 相关原文」小节（markdown）。
 * 无条目时返回空字符串。标题即可成文；id 缺失时仍写入文字引用（UI 点击需有 id）。
 */
export function buildKnowledgeCitationMarkdown(
  entries: CiteSourceEntry[],
  max = KNOWLEDGE_CITE_MAX_ENTRIES,
): string {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry?.title?.trim()) continue
    const key = entry.id || `${entry.category}:${entry.title}`
    if (seen.has(key)) continue
    seen.add(key)
    const label = knowledgeCategoryLabel(entry.category)
    lines.push(`- 相关原文见 《${entry.title.trim()}》（${label}）`)
    if (lines.length >= max) break
  }
  if (lines.length === 0) return ""
  return `### 相关原文\n${lines.join("\n")}`
}

/**
 * 把系统确定性相关原文块写入 / 覆盖 method note。
 */
export function upsertKnowledgeCitationInMethodNote(
  methodNoteInner: string,
  citationBlock: string,
): string {
  const trimmedNote = methodNoteInner.trim()
  if (!citationBlock.trim()) return trimmedNote
  const withoutOld = trimmedNote
    .replace(/\n*###\s*相关原文\s*\n[\s\S]*?(?=\n###\s|\s*$)/, "")
    .trim()
  return `${withoutOld}\n\n${citationBlock.trim()}`.trim()
}

/**
 * 知识块行锚点：短 id + 分类，便于模型来源标注对齐真实条目。
 */
export function formatKnowledgeEntryAnchor(entry: { id: string; category: string }): string {
  const shortId = entry.id.slice(0, 8)
  const label = knowledgeCategoryLabel(entry.category)
  return `[KE:${shortId}|${label}]`
}
