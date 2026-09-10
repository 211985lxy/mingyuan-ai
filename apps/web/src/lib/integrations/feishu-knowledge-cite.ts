/**
 * 飞书知识引用来源：从工具环结果抽出标题/链接，供回答卡片与审计使用。
 * 不携带 access token；文档 token 仅作去重键，不进审计摘要。
 */

import { specialistAuditInput, recordAuditEvent } from "@/lib/audit-events"
import { toFeishuSourceCards } from "./feishu-knowledge-source"

export {
  encodeFeishuSourceHeader,
  decodeFeishuSourceHeader,
  FEISHU_SOURCE_HEADER,
  toFeishuSourceCards,
  type FeishuKnowledgeSourceCard,
} from "./feishu-knowledge-source"

export const FEISHU_KNOWLEDGE_CATEGORY = "feishu"

export interface FeishuKnowledgeSource {
  title: string
  url: string
  token: string
  snippet?: string
}

export interface FeishuKnowledgeCiteDigest {
  sources: FeishuKnowledgeSource[]
  queries: string[]
  identity: "user" | "bot" | "none"
}

type ToolLoopStepLike = {
  toolName?: string
  observation?: string
  toolArgs?: Record<string, unknown>
}

export function collectFeishuKnowledgeSources(steps: ToolLoopStepLike[]): FeishuKnowledgeCiteDigest {
  const sources: FeishuKnowledgeSource[] = []
  const queries: string[] = []
  const seen = new Set<string>()
  let identity: FeishuKnowledgeCiteDigest["identity"] = "none"

  for (const step of steps) {
    if (step.toolName !== "feishu_knowledge_search" && step.toolName !== "feishu_doc_read") continue
    const query = typeof step.toolArgs?.query === "string" ? step.toolArgs.query.trim() : ""
    if (query && !queries.includes(query)) queries.push(query.slice(0, 30))
    const payload = parseJson(step.observation)
    if (!payload) continue
    identity = readIdentity(payload.identity, identity)
    if (Array.isArray(payload.results)) {
      for (const item of payload.results) pushSource(sources, seen, asRecord(item))
    } else {
      pushSource(sources, seen, payload)
    }
  }
  return { sources: sources.slice(0, 8), queries, identity }
}

export function recordFeishuKnowledgeSearchAudit(input: {
  userId: string
  projectId?: string
  digest: FeishuKnowledgeCiteDigest
  correlationId?: string
}) {
  if (input.digest.queries.length === 0 && input.digest.sources.length === 0) {
    return Promise.resolve({ ok: true, inserted: false })
  }
  const cited = toFeishuSourceCards(input.digest.sources)
  const queryText = input.digest.queries.join(" / ") || "（无关键词）"
  return recordAuditEvent(specialistAuditInput({
    source: "aim",
    category: "execution",
    status: "success",
    action: "feishu_knowledge_search",
    summary: `检索「${queryText}」引用 ${cited.length} 篇飞书文档`,
    sourceRecordType: "FeishuKnowledgeSearch",
    sourceRecordId: input.correlationId || `${input.userId}:${Date.now()}`,
    actorType: "user",
    actorId: input.userId,
    projectId: input.projectId,
    correlationId: input.correlationId,
    metadata: {
      queries: input.digest.queries,
      identity: input.digest.identity,
      cited,
    },
  }))
}

function pushSource(
  sources: FeishuKnowledgeSource[],
  seen: Set<string>,
  record: Record<string, unknown> | null,
) {
  if (!record) return
  const title = readString(record.title)
  const url = readString(record.url)
  const token = readString(record.token)
  if (!title || !isSafeFeishuUrl(url)) return
  const key = token || url
  if (seen.has(key)) return
  seen.add(key)
  const snippet = readString(record.summary) || readString(record.content).slice(0, 120)
  sources.push({ title, url, token: token || url, ...(snippet ? { snippet } : {}) })
}

function parseJson(raw?: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null
  try {
    return asRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

function readIdentity(value: unknown, fallback: FeishuKnowledgeCiteDigest["identity"]) {
  if (value === "user" || value === "bot") return value
  return fallback
}

function isSafeFeishuUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && /(^|\.)feishu\.cn$|(^|\.)larkoffice\.com$/.test(parsed.hostname)
  } catch {
    return false
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
