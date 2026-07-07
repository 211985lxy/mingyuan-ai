import { prisma } from "@/lib/prisma"

/**
 * 写作风格档案的统一 category 常量。
 * category 是 schema 里的 String（非 enum），新增无需 prisma migration，只靠代码常量收敛引用。
 */
export const STYLE_PROFILE_CATEGORY = "writing_style_profile"

/** 主档案的固定 title，作为 upsert / 合并的 anchor */
export const STYLE_PROFILE_MAIN_TITLE = "IP 写作风格主档案"

const MAX_ENTRY_CHARS = 1200
const MAX_BLOCK_CHARS = 1500
const MAX_ENTRIES = 3

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + "…"
}

function formatDate(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * 读取用户的【全局写作风格档案】文本块，供脚本生成 / AIM 智能体 / 润色注入。
 *
 * 关键设计：**不走 retrieveRelevantKnowledge**——
 * 那条链路硬过滤 projectId（aim/chat 还会传 "<no-project>" 字面量），
 * 用户级（projectId=null）的风格档案永远检索不到。
 * 这里直接按 userId + category + projectId:null 全量取——风格档案本就是一条主档案，
 * 条目极少，不需要 embedding 语义筛选。
 *
 * 返回空串表示用户尚未沉淀风格档案，调用方应跳过注入（行为与改动前一致）。
 */
export async function getStyleProfileBlock(userId: string): Promise<string> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      userId,
      category: STYLE_PROFILE_CATEGORY,
      projectId: null,
      status: "active",
    },
    orderBy: [{ updatedAt: "desc" }],
    take: MAX_ENTRIES,
    select: { title: true, content: true, updatedAt: true },
  })

  if (entries.length === 0) return ""

  const headerLine = `\n\n=== 写作风格档案（IP 全局风格） ===`
  const parts: string[] = [headerLine]
  let used = headerLine.length

  for (const entry of entries) {
    const pieceHeader = `\n【${entry.title}】（更新于 ${formatDate(entry.updatedAt)}）\n`
    const pieceBody = truncate(entry.content, MAX_ENTRY_CHARS)
    const piece = pieceHeader + pieceBody

    if (used + piece.length > MAX_BLOCK_CHARS) {
      parts.push("\n（更多历史风格档案已省略，达到上下文预算）")
      break
    }
    parts.push(piece)
    used += piece.length
  }

  return parts.join("")
}
