import { prisma } from "@/lib/prisma"
import {
  STYLE_PROFILE_CATEGORY,
  STYLE_PROFILE_MAIN_TITLE,
} from "@/lib/style-profile-constants"

export { STYLE_PROFILE_CATEGORY, STYLE_PROFILE_MAIN_TITLE } from "@/lib/style-profile-constants"

const MAX_ENTRY_CHARS = 1800
const MAX_BLOCK_CHARS = 2200
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

type StyleEntryRow = { title: string; content: string; updatedAt: Date }

async function loadStyleEntries(
  userId: string,
  projectId: string | null,
): Promise<StyleEntryRow[]> {
  return prisma.knowledgeEntry.findMany({
    where: {
      userId,
      category: STYLE_PROFILE_CATEGORY,
      projectId,
      status: "active",
    },
    orderBy: [{ updatedAt: "desc" }],
    take: MAX_ENTRIES,
    select: { title: true, content: true, updatedAt: true },
  })
}

function formatStyleBlock(entries: StyleEntryRow[], headerLine: string): string {
  if (entries.length === 0) return ""

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

/**
 * 读取写作风格档案文本块，供脚本生成 / AIM / 润色注入。
 *
 * 不走 retrieveRelevantKnowledge（会过滤掉 projectId=null 的全局档案）。
 * 优先级：当前项目档案 → 同用户全局档案 → 空串（跳过注入）。
 * 禁止跨项目、跨用户召回。
 */
export async function getStyleProfileBlock(userId: string, projectId?: string | null): Promise<string> {
  const effectiveProjectId = projectId ?? null

  if (effectiveProjectId) {
    const projectEntries = await loadStyleEntries(userId, effectiveProjectId)
    if (projectEntries.length > 0) {
      return formatStyleBlock(projectEntries, "\n\n=== 写作风格档案（项目风格） ===")
    }
    const globalEntries = await loadStyleEntries(userId, null)
    return formatStyleBlock(
      globalEntries,
      "\n\n=== 写作风格档案（IP 全局风格，项目无档案回退） ===",
    )
  }

  const globalEntries = await loadStyleEntries(userId, null)
  return formatStyleBlock(globalEntries, "\n\n=== 写作风格档案（IP 全局风格） ===")
}

/**
 * 是否存在可用的风格档案（项目优先，无则看全局）。
 * 供创作台「我的风格 · 已启用」状态条使用。
 */
export async function hasActiveStyleProfile(
  userId: string,
  projectId?: string | null,
): Promise<{ enabled: boolean; scope: "project" | "global" | "none" }> {
  const effectiveProjectId = projectId ?? null
  if (effectiveProjectId) {
    const projectCount = await prisma.knowledgeEntry.count({
      where: {
        userId,
        category: STYLE_PROFILE_CATEGORY,
        projectId: effectiveProjectId,
        status: "active",
      },
    })
    if (projectCount > 0) return { enabled: true, scope: "project" }
  }
  const globalCount = await prisma.knowledgeEntry.count({
    where: {
      userId,
      category: STYLE_PROFILE_CATEGORY,
      projectId: null,
      status: "active",
    },
  })
  if (globalCount > 0) return { enabled: true, scope: "global" }
  return { enabled: false, scope: "none" }
}
