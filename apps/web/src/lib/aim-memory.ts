import { prisma } from "@/lib/prisma"
import { LLMClient } from "@/lib/llm/client"
import type { ChatMessage } from "@/lib/llm/types"

// ─── AIM 智能体持久化记忆 ─────────────────────────────────
//
// 把对话中值得长期记住的「事实 / 偏好 / 决策 / 摘要」沉淀下来，
// 下次同项目同 agent 生成时召回注入。
//
// 与 /api/aim/evolve（只产出 suggestions 不落库）互补：
// - evolve 负责在线提炼偏好建议（可能写入 knowledge）；
// - 本模块负责把对话本身沉淀为可召回的记忆条目。

export type AimMemoryKind = "conversation_summary" | "preference" | "decision" | "fact"

export const MEMORY_KINDS: readonly AimMemoryKind[] = [
  "conversation_summary",
  "preference",
  "decision",
  "fact",
]

export interface AimMemoryMessage {
  role: "user" | "assistant"
  content: string
}

export interface AimMemoryDraft {
  kind: AimMemoryKind
  content: string
}

export interface AimMemoryRow {
  id: string
  kind: string
  content: string
  agentId: string
  createdAt: Date
  relevance: number
}

// ─── 1. Prompt 构造与解析（纯函数，可单测） ────────────────

const SUMMARY_SYSTEM_PROMPT = `你是 AIM 智能体的长期记忆提炼器。从一段对话中提炼出「值得长期记住」的信息，供未来同项目的内容创作复用。

可提炼类型（kind）：
- decision：用户已确认的决策（如定位方向、选题取舍、风格选择）
- preference：用户的稳定偏好（喜欢的语气/结构/禁忌表达）
- fact：业务事实（产品卖点、客户画像、成交路径、运营数据）

不要提炼：
- 一次性改稿指令（如「这次把第二段缩短」）
- 助手自己的建议或提问
- 没有用户证据的猜测

输出纯 JSON（不要 markdown 代码块），结构如下：
{"memories":[{"kind":"decision","content":"用户确认主打『敏感肌美白』定位，放弃『平价』路线"},{"kind":"fact","content":"目标人群是 25-35 岁一二线城市职场女性"}]}

如果没有值得长期沉淀的内容，返回 {"memories":[]}。content 控制在 20-120 字，简洁可复用。`

export function buildMemoryExtractionPrompt(messages: AimMemoryMessage[]): string {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n\n")
    .slice(0, 4000)
  return transcript
}

export function buildMemoryExtractionMessages(
  messages: AimMemoryMessage[],
): ChatMessage[] {
  return [
    { role: "system", content: SUMMARY_SYSTEM_PROMPT },
    { role: "user", content: buildMemoryExtractionPrompt(messages) },
  ]
}

function isMemoryKind(v: unknown): v is AimMemoryKind {
  return typeof v === "string" && (MEMORY_KINDS as readonly string[]).includes(v)
}

/**
 * 解析 LLM 输出为记忆草稿列表（纯函数，对畸形输入容错）。
 */
export function parseMemoryExtraction(raw: string): AimMemoryDraft[] {
  if (!raw || typeof raw !== "string") return []
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return []
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return []
    }
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>)?.memories)
      ? (parsed as Record<string, unknown>).memories
      : Array.isArray((parsed as Record<string, unknown>)?.items)
        ? (parsed as Record<string, unknown>).items
        : []
  if (!Array.isArray(arr)) return []

  const seen = new Set<string>()
  const drafts: AimMemoryDraft[] = []
  for (const item of arr as unknown[]) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    if (!isMemoryKind(obj.kind)) continue
    const content = typeof obj.content === "string" ? obj.content.trim().slice(0, 300) : ""
    if (!content) continue
    const key = `${obj.kind}|${content}`
    if (seen.has(key)) continue
    seen.add(key)
    drafts.push({ kind: obj.kind, content })
  }
  return drafts.slice(0, 8)
}

// ─── 2. LLM 提炼（带降级） ─────────────────────────────────

/**
 * 从对话中提炼值得长期沉淀的记忆草稿。失败返回空数组（不抛错）。
 */
export async function summarizeConversationForMemory(
  messages: AimMemoryMessage[],
): Promise<AimMemoryDraft[]> {
  // 至少 2 轮有效对话才有提炼价值
  const valid = messages.filter((m) => m.content.trim().length > 0)
  if (valid.length < 2) return []
  try {
    const completion = await LLMClient.shared().complete({
      messages: buildMemoryExtractionMessages(valid),
      temperature: 0.2,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
    })
    return parseMemoryExtraction(completion.content)
  } catch (error) {
    console.warn("[aim-memory] extraction failed:", error)
    return []
  }
}

// ─── 3. 持久化 ─────────────────────────────────────────────

interface PersistContext {
  userId: string
  projectId?: string | null
  agentId: string
  sourceGenerationId?: string | null
}

/**
 * 把记忆草稿幂等写入 AimMemory。
 * 去重策略：同 projectId+agentId+kind+content 已存在则跳过（不重复写）。
 */
export async function persistAimMemories(
  drafts: AimMemoryDraft[],
  ctx: PersistContext,
): Promise<number> {
  if (drafts.length === 0) return 0
  let written = 0
  for (const draft of drafts) {
    try {
      const exists = await prisma.aimMemory.findFirst({
        where: {
          userId: ctx.userId,
          projectId: ctx.projectId ?? null,
          agentId: ctx.agentId,
          kind: draft.kind,
          content: draft.content,
          status: "active",
        },
        select: { id: true },
      })
      if (exists) continue
      await prisma.aimMemory.create({
        data: {
          userId: ctx.userId,
          projectId: ctx.projectId ?? null,
          agentId: ctx.agentId,
          kind: draft.kind,
          content: draft.content,
          entityIds: [],
          sourceGenerationId: ctx.sourceGenerationId ?? null,
          relevance: 1.0,
          status: "active",
        },
      })
      written += 1
    } catch (error) {
      console.warn("[aim-memory] persist draft failed:", error)
    }
  }
  return written
}

/**
 * 入口：提炼 + 持久化。供 generate/chat 路由 fire-and-forget 调用。
 */
export async function persistMemoriesFromConversation(
  messages: AimMemoryMessage[],
  ctx: PersistContext,
): Promise<number> {
  const drafts = await summarizeConversationForMemory(messages)
  return persistAimMemories(drafts, ctx)
}

// ─── 4. 召回与注入 ─────────────────────────────────────────

function sortAimMemoryRows(rows: AimMemoryRow[], topK: number): AimMemoryRow[] {
  const kindOrder: Record<string, number> = {
    decision: 0,
    preference: 1,
    fact: 2,
    conversation_summary: 3,
  }

  return rows
    .sort((a, b) => {
      const ko = (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)
      if (ko !== 0) return ko
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
    .slice(0, topK)
}

/**
 * 按项目 + agent 召回近 N 条记忆，按 kind 固定优先级排序：
 * decision > preference > fact > conversation_summary
 */
export async function retrieveAimMemory(input: {
  userId: string
  projectId?: string | null
  agentId?: string
  topK?: number
}): Promise<AimMemoryRow[]> {
  const { userId, projectId, agentId } = input
  const topK = input.topK ?? 6

  try {
    const rows = await prisma.aimMemory.findMany({
      where: {
        userId,
        projectId: projectId ?? null,
        status: "active",
        ...(agentId ? { agentId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: topK * 3, // 多取一些再按 kind 重排
      select: { id: true, kind: true, content: true, agentId: true, createdAt: true, relevance: true },
    })
    return sortAimMemoryRows(rows, topK)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        content: r.content,
        agentId: r.agentId,
        createdAt: r.createdAt,
        relevance: r.relevance,
      }))
  } catch (error) {
    console.warn("[aim-memory] retrieve failed:", error)
    return []
  }
}

export function mergeAimMemoryRows(
  primaryRows: AimMemoryRow[],
  fallbackRows: AimMemoryRow[],
  topK = 6,
): AimMemoryRow[] {
  const seen = new Set<string>()
  const merged: AimMemoryRow[] = []

  for (const row of [...primaryRows, ...fallbackRows]) {
    const dedupeKey = `${row.kind}|${row.content}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    merged.push(row)
  }

  return sortAimMemoryRows(merged, topK)
}

export async function retrieveLayeredAimMemory(input: {
  userId: string
  projectId?: string | null
  agentId?: string
  topK?: number
}): Promise<AimMemoryRow[]> {
  return retrieveAimMemory({
    ...input,
    projectId: input.projectId ?? null,
    topK: input.topK ?? 6,
  })
}

const KIND_LABEL: Record<string, string> = {
  decision: "已确认决策",
  preference: "用户偏好",
  fact: "业务事实",
  conversation_summary: "对话摘要",
}

/**
 * 把召回的记忆格式化为可注入 prompt 的文本块。
 */
export function formatAimMemoryBlock(rows: AimMemoryRow[]): string {
  if (rows.length === 0) return ""
  const lines = rows.map((r) => {
    const label = KIND_LABEL[r.kind] ?? r.kind
    return `- [${label}] ${r.content}`
  })
  return `=== 历史记忆（此前对话沉淀，请保持一致）===\n${lines.join("\n")}`
}
