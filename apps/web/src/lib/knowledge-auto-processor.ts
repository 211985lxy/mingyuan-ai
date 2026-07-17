import { prisma } from "@/lib/prisma"
import { LLMClient } from "@/lib/llm/client"
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"
import type { KnowledgeCategory } from "@/lib/knowledge-categories"

// ─── 类型 ──────────────────────────────────────────────────

export interface ProcessedChunk {
  index: number
  originalText: string
  detectedSource: "general" | "wechat_chat"
  suggestedTitle: string
  suggestedKeyPoints: string
  suggestedCategory: string
  suggestedTags: string[]
  suggestedValueGrade: string
  duplicateOfId?: string
  duplicateScore?: number
  confidence: "high" | "medium" | "low"
}

interface ChatMessage {
  sender: string
  timestamp: string
  content: string
}

// ─── 常量 ──────────────────────────────────────────────────

const BATCH_SIZE = 15

// ─── 1a. 微信导出检测 ─────────────────────────────────────

export function detectWeChatExport(text: string): boolean {
  const patterns = [
    /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+/m,
    /\[wxid_\w+\]/,
    /^.{2,20}:\s*\S/m,
  ]
  const matchCount = patterns.reduce((acc, pat) => acc + (pat.test(text) ? 1 : 0), 0)
  return matchCount >= 2
}

export function parseWeChatExport(text: string): ChatMessage[] {
  const lines = text.split(/\n/)
  const messages: ChatMessage[] = []
  const timestampRegex = /^(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)/

  let currentMsg: ChatMessage | null = null
  for (const line of lines) {
    const match = line.match(timestampRegex)
    if (match) {
      if (currentMsg) messages.push(currentMsg)
      const rest = match[2]
      const colonIdx = rest.indexOf(":")
      if (colonIdx > 0) {
        currentMsg = {
          timestamp: match[1],
          sender: rest.slice(0, colonIdx).trim(),
          content: rest.slice(colonIdx + 1).trim(),
        }
      } else {
        currentMsg = { timestamp: match[1], sender: "unknown", content: rest.trim() }
      }
    } else if (currentMsg && line.trim()) {
      currentMsg.content += "\n" + line.trim()
    }
  }
  if (currentMsg) messages.push(currentMsg)
  return messages
}

// ─── 1b. LLM 分类 Prompt ──────────────────────────────────

function buildClassificationPrompt(
  chunks: string[],
  isWeChat: boolean,
  projectContext?: string,
): { system: string; user: string } {
  const projectSection = projectContext
    ? `\n项目背景：${projectContext}\n`
    : ""

  const wechatInstruction = isWeChat
    ? "\n重要：文本是微信/企微聊天记录，提取其中有价值的商业知识、客户反馈、痛点信息、成交线索，忽略日常闲聊和表情。"
    : ""

  const systemPrompt = `你是知识库管理专家。分析以下文本块，为每个块输出 JSON 数组。

对每个文本块：
1. 判断最合适的知识分类（12类之一）
2. 提炼标题（20字以内）
3. 提炼关键要点（200字以内）
4. 分配标签：kb_scope(ip|project)、asset_role(story|proof|judgment|usp|pain|case|benchmark|inspiration)、usable_for(xhs|wechat|video|sales|topic，可多个)、confidence(confirmed|user_claim|pending_verify)
5. 价值分级 S/A/B/C
6. 置信度 high/medium/low

分类选项：${KNOWLEDGE_CATEGORIES.join(", ")}${wechatInstruction}${projectSection}

输出格式（纯 JSON，不要 markdown 代码块）：
[{"index":0,"suggestedTitle":"...","suggestedKeyPoints":"...","suggestedCategory":"product_usp","suggestedTags":["kb_scope:project","asset_role:usp","usable_for:sales","confidence:user_claim"],"suggestedValueGrade":"B","confidence":"high"}]`

  const userContent = chunks
    .map((c, i) => `[${i}]\n${c.slice(0, 3000)}`)
    .join("\n\n---\n\n")

  return {
    system: systemPrompt,
    user: `请分析以下 ${chunks.length} 个文本块：\n\n${userContent}`,
  }
}

// ─── 1c. 去重检测 ────────────────────────────────────────

export async function findPotentialDuplicates(
  text: string,
  userId: string,
  projectId?: string,
): Promise<{ entryId: string; title: string; score: number }[]> {
  const keywords = text
    .replace(/[^一-鿿\w]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 5)

  if (keywords.length === 0) return []

  const candidates = await prisma.knowledgeEntry.findMany({
    where: {
      userId,
      ...(projectId ? { projectId } : {}),
      status: "active",
      OR: keywords.map((kw) => ({ content: { contains: kw } })),
    },
    select: { id: true, title: true, content: true },
    take: 10,
  })

  return candidates
    .map((c) => ({ entryId: c.id, title: c.title, score: computeTextOverlap(text, c.content) }))
    .filter((s) => s.score > 0.7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

function computeTextOverlap(a: string, b: string): number {
  const trigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3))
    return set
  }
  const ta = trigrams(a.slice(0, 2000))
  const tb = trigrams(b.slice(0, 2000))
  if (ta.size === 0 && tb.size === 0) return 0
  let intersection = 0
  for (const t of ta) {
    if (tb.has(t)) intersection++
  }
  const union = ta.size + tb.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ─── 1d. 主处理函数 ──────────────────────────────────────

export async function processChunksForSmartImport(input: {
  chunks: string[]
  fileName: string
  userId: string
  projectId?: string
}): Promise<ProcessedChunk[]> {
  const { chunks, fileName, userId, projectId } = input

  const isWeChat = chunks.some((c) => detectWeChatExport(c))
  const projectInfo = projectId
    ? await prisma.clientProject.findUnique({
        where: { id: projectId },
        select: { name: true, companyName: true, industry: true, targetCustomer: true },
      })
    : undefined
  const projectStr = projectInfo
    ? `${projectInfo.name}（${projectInfo.companyName || projectInfo.industry || ""}）目标客户：${projectInfo.targetCustomer || "未知"}`
    : undefined

  const llm = LLMClient.shared()
  const results: ProcessedChunk[] = []

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const prompt = buildClassificationPrompt(batch, isWeChat, projectStr)

    try {
      const result = await llm.complete({
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.3,
        maxTokens: Math.min(8000, 2000 * batch.length),
        responseFormat: { type: "json_object" },
      })

      const parsed = JSON.parse(result.content.trim())
      const items = Array.isArray(parsed) ? parsed : parsed.items || parsed.results || []

      for (const item of items) {
        const chunkIndex = (item.index as number) ?? results.length
        const chunk = chunks[chunkIndex] || batch[0]
        const duplicates = await findPotentialDuplicates(chunk, userId, projectId)

        results.push({
          index: chunkIndex,
          originalText: chunk,
          detectedSource: isWeChat ? "wechat_chat" : "general",
          suggestedTitle: (item.suggestedTitle as string) || fileName,
          suggestedKeyPoints: (item.suggestedKeyPoints as string) || chunk.slice(0, 200),
          suggestedCategory: isKnowledgeCategory(item.suggestedCategory)
            ? item.suggestedCategory
            : "daily_inspiration",
          suggestedTags: Array.isArray(item.suggestedTags)
            ? (item.suggestedTags as string[])
            : ["confidence:user_claim"],
          suggestedValueGrade: ["S", "A", "B", "C"].includes(item.suggestedValueGrade as string)
            ? (item.suggestedValueGrade as string)
            : "B",
          duplicateOfId: duplicates[0]?.entryId,
          duplicateScore: duplicates[0]?.score,
          confidence: ["high", "medium", "low"].includes(item.confidence as string)
            ? (item.confidence as "high" | "medium" | "low")
            : "medium",
        })
      }
    } catch (error) {
      console.error(`[smart-import] LLM batch ${i / BATCH_SIZE + 1} failed:`, error)
      // Fallback: create unclassified entries for this batch
      for (const chunk of batch) {
        results.push({
          index: i + batch.indexOf(chunk),
          originalText: chunk,
          detectedSource: isWeChat ? "wechat_chat" : "general",
          suggestedTitle: fileName,
          suggestedKeyPoints: chunk.slice(0, 200),
          suggestedCategory: "daily_inspiration",
          suggestedTags: ["confidence:pending_verify"],
          suggestedValueGrade: "B",
          confidence: "low",
        })
      }
    }
  }

  return results
}
