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


/**
 * 采访 → 风格档案的纯函数派生（不直接写库，调用方自行通过 prisma.knowledgeEntry upsert 落库）。
 *
 * 返回一个 KnowledgeEntry 形状的 draft（category=STYLE_PROFILE_CATEGORY，
 * title=STYLE_PROFILE_MAIN_TITLE），包含：
 *  - tone：表达习惯的语气基调提炼
 *  - voice：人设声音 / 措辞倾向
 *  - forbiddenWords：从内容边界提取的禁词 / 禁表达项
 *  - content：合并后的主档案文本（供风格面板人工编辑）
 */
export function applyInterviewToStyleProfile(input: {
  expressionStyle: string
  contentBoundaries: string[]
  strengthsWeaknesses?: { strengths: string[]; weaknesses: string[] } | null
  oldContent?: string | null
}): {
  category: string
  title: string
  content: string
  tone: string
  voice: string
  forbiddenWords: string[]
} {
  const expressionStyle = (input.expressionStyle || "").trim()
  const boundaries = (input.contentBoundaries || []).filter((s) => s && s.trim())
  const strengths = (input.strengthsWeaknesses?.strengths ?? []).filter((s) => s)

  // tone：从表达习惯里提炼关键字（3-5 个，短语）
  const toneKeywords = new Set<string>()
  for (const w of ["口语化", "专业严谨", "幽默风趣", "犀利直接", "干货密集", "故事性", "温柔", "理性", "接地气"]) {
    if (expressionStyle.includes(w)) toneKeywords.add(w)
  }
  if (toneKeywords.size === 0) {
    toneKeywords.add("自然口语")
  }
  const tone = Array.from(toneKeywords).slice(0, 5).join("、")

  // voice：基于 strengths + 表达习惯拼一句人设声音描述
  const voiceParts: string[] = []
  if (strengths.length) {
    voiceParts.push(`以「${strengths.slice(0, 2).join(" / ")}」为内容底气`)
  }
  if (expressionStyle) {
    voiceParts.push(`表达上「${expressionStyle.slice(0, 80)}」`)
  }
  const voice = voiceParts.join("，") || "自然、真实、有温度的创始人表达"

  // forbiddenWords：从 contentBoundaries 里挑出「禁 + 词/说/提」的条目
  const forbidden: string[] = []
  for (const b of boundaries) {
    const clean = b.trim().slice(0, 40)
    if (!clean) continue
    // 只要是边界条目，都当成禁表达项收录（最多 15 条）
    forbidden.push(clean)
    if (forbidden.length >= 15) break
  }

  // content：合并旧档案 + 新增的采访风格信息（人工可读的风格档案）
  const newBlock = [
    "【采访提取 · 表达习惯】",
    expressionStyle || "（采访未填写）",
    "",
    "【采访提取 · 内容边界】",
    boundaries.length ? boundaries.map((b) => `- ${b}`).join("\n") : "- （未设置）",
    "",
    "【采访提取 · 推荐基调】",
    `- 语气（tone）：${tone}`,
    `- 人设声音（voice）：${voice}`,
  ].join("\n").replace(/\\n/g, "\n")

  const content = input.oldContent && input.oldContent.trim()
    ? `${input.oldContent.trim()}\n\n========= 采访同步（${new Date().toISOString().slice(0, 10)}） =========\n${newBlock}`
    : newBlock

  return {
    category: STYLE_PROFILE_CATEGORY,
    title: STYLE_PROFILE_MAIN_TITLE,
    content,
    tone,
    voice,
    forbiddenWords: forbidden,
  }
}
