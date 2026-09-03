import { createHash } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

/**
 * 用户问题卡归一化 & 入库管线
 * - 从 Inspiration content 中识别问句/诉求
 * - 基于中文双字词频生成 similarityGroupKey（关键词 hash 版）
 * - 按 (userId, similarityGroupKey) 做 upsert，聚合同类问题
 *
 * 设计约束：
 * - 所有 Prisma 异常吞掉 (console.warn) 并 return null，不影响主流程
 * - 非问句/非诉求直接 return null，不建卡
 */

// ── 问句正则：命中任意一条即判定为"问句" ──
const QUESTION_PATTERN = /[?？]|如何|怎么|为什么|为啥|请问|求助|有没有|能否|求推荐|怎么办|啥意思|哪种/

// ── 诉求正则：开头或内容中包含明确的诉求表达 ──
//    注："开头或含" 在"包含"下等价（开头匹配是包含的子集），单独列出开头锚点冗余
const DEMAND_PATTERN =
  /我想|我需要|求推荐|请教|想问下|帮忙推荐|咨询一下|我现在的问题是/

// ── 清洗：@人名 / 链接 / emoji ──
const AT_MENTION_RE = /@[\u4e00-\u9fa5A-Za-z0-9_\-·]+/g
const URL_RE = /https?:\/\/[^\s，。；、"'<>）)]+/gi
const EMOJI_RE =
  /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}\u{2B06}\u{2194}-\u{2199}\u{3030}\u{303D}\u{3297}\u{3299}\u{25AA}-\u{25AB}\u{25FE}\u{25FD}\u{25B6}\u{25C0}\u{25FB}\u{25FC}\u{23F3}\u{231B}\u{23F9}\u{231A}\u{23E9}-\u{23EF}\u{25AA}\u{25AB}]/gu

// ── 中文停用词（常见 2 字滑窗会产生的噪声词） ──
const STOP_CHARS = new Set([
  "的", "了", "是", "在", "和", "与", "我", "你", "他", "她",
  "这", "那", "也", "就", "都", "还", "啊", "吧", "呢", "吗",
  "之", "及", "等", "并", "或", "一", "个", "上", "下", "中",
  "对", "从", "到", "把", "给", "向", "跟", "被", "让", "于",
  "以", "为", "因", "但", "而", "如", "若", "虽", "然", "且",
  "又", "再", "已", "曾", "将", "正", "刚", "才", "只", "更",
  "最", "很", "非", "太", "真", "好", "多", "少", "大", "小",
  "没", "不", "会", "能", "要", "可", "应", "该", "需", "必",
  "当", "每", "各", "某", "另", "其", "此", "彼",
])

// ── 只保留中文字符（用于双字词提取） ──
const CHINESE_ONLY_RE = /[^\u4e00-\u9fa5]/g

export type InspirationLike = {
  /** 原文（即 Inspiration.content） */
  content: string
  /** 来源渠道（comment|dm|consulting|community|other），未知传 "other" */
  source?: string | null
}

export type NormalizeAndUpsertInput = {
  userId: string
  projectId?: string | null
  inspiration: InspirationLike
}

/**
 * 判断一段文本是否是问句或明确诉求。
 * 两者皆不满足则返回 false → 管线跳过。
 */
export function isQuestionOrDemand(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false
  return QUESTION_PATTERN.test(trimmed) || DEMAND_PATTERN.test(trimmed)
}

/**
 * 清洗文本：去除 @mention、链接、emoji，返回干净文本。
 * 注意：保留标点 & 空白（最终 originalText 也用此版本截断）。
 */
export function cleanOriginalText(raw: string): string {
  return raw
    .replace(AT_MENTION_RE, "")
    .replace(URL_RE, "")
    .replace(EMOJI_RE, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 生成 similarityGroupKey：
 * 1. 清洗后提取纯中文
 * 2. 2 字滑窗取所有连续中文双字词
 * 3. 过滤停用词（任一字是停用词 → 丢弃该 2 字词）
 * 4. 统计词频，取 Top 6（按 词频 desc, 词字典序 asc 稳定排序）
 * 5. 不足 2 个 → null
 * 6. SHA1(Top6 用 "," 拼接) → 取前 16 位 hex
 */
export function generateSimilarityGroupKey(text: string): string | null {
  const chinese = cleanOriginalText(text).replace(CHINESE_ONLY_RE, "")
  if (chinese.length < 2) return null

  const bigramCounts = new Map<string, number>()
  for (let i = 0; i < chinese.length - 1; i++) {
    const a = chinese[i]!
    const b = chinese[i + 1]!
    if (STOP_CHARS.has(a) || STOP_CHARS.has(b)) continue
    const key = a + b
    bigramCounts.set(key, (bigramCounts.get(key) ?? 0) + 1)
  }

  if (bigramCounts.size < 2) return null

  const sorted = Array.from(bigramCounts.entries()).sort((x, y) => {
    if (y[1] !== x[1]) return y[1] - x[1]
    return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0
  })
  const top6 = sorted.slice(0, 6).map(([word]) => word)
  const signatureMaterial = top6.join(",")
  const sha1 = createHash("sha1").update(signatureMaterial, "utf8").digest("hex")
  return sha1.slice(0, 16)
}

/**
 * 截断原文到 <= 200 字符（用于 userQuoteSnippets 单条存储）。
 */
export function truncateSnippet(text: string, max = 200): string {
  const t = cleanOriginalText(text)
  if (t.length <= max) return t
  return t.slice(0, max - 1) + "…"
}

function resolveStoredSource(src: string | null | undefined): string {
  if (!src) return "other"
  switch (src) {
    case "feishu":
    case "comment":
    case "dm":
    case "consulting":
    case "community":
    case "workbuddy_wechat":
    case "wecom":
    case "webhook":
    case "other":
      // comment / dm 等语义来源直接透传；飞书类渠道按"社区/咨询"粗分
      if (src === "feishu" || src === "wecom" || src === "workbuddy_wechat") return "community"
      return src
    default:
      return "other"
  }
}

/**
 * 核心管线：识别 → 生成签名 → (userId, signature) upsert 一张 UserQuestionCard。
 *
 * 返回：
 * - 新创建/更新的 card id（string）；
 * - 或 null（非问句/诉求、bigram 不足、Prisma 出错等任何情况都为 null）。
 */
export async function normalizeQuestionAndUpsertCard(
  input: NormalizeAndUpsertInput,
): Promise<string | null> {
  const { userId, projectId, inspiration } = input
  try {
    const rawContent = inspiration.content
    if (!rawContent) return null
    if (!isQuestionOrDemand(rawContent)) return null

    const cleaned = cleanOriginalText(rawContent)
    if (!cleaned) return null

    const similarityGroupKey = generateSimilarityGroupKey(cleaned)
    if (!similarityGroupKey) return null

    const snippet = truncateSnippet(cleaned)
    const storedSource = resolveStoredSource(inspiration.source ?? null)
    const safeProjectId = projectId ?? undefined

    const existing = await prisma.userQuestionCard.findFirst({
      where: { userId, similarityGroupKey },
      select: { id: true, occurrenceCount: true, userQuoteSnippets: true },
    })

    if (existing) {
      const currentSnippets = (existing.userQuoteSnippets ?? []) as string[]
      const nextSnippets = [...currentSnippets, snippet] as unknown as Prisma.InputJsonValue
      const updated = await prisma.userQuestionCard.update({
        where: { id: existing.id },
        data: {
          occurrenceCount: { increment: 1 },
          userQuoteSnippets: nextSnippets,
        },
        select: { id: true },
      })
      return updated.id
    }

    const created = await prisma.userQuestionCard.create({
      data: {
        userId,
        projectId: safeProjectId,
        originalText: cleaned,
        source: storedSource,
        occurrenceCount: 1,
        userQuoteSnippets: [snippet] as unknown as Prisma.InputJsonValue,
        similarityGroupKey,
        status: "pending",
      },
      select: { id: true },
    })
    return created.id
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn("[user-question-normalize] upsert failed, swallowed:", msg, {
      userId,
      projectId,
      contentPreview: inspiration.content?.slice(0, 80) ?? null,
    })
    return null
  }
}

/**
 * 灵感写入成功后的"影子模式"入口：
 * - 在飞书消息写入 Inspiration 之后调用（无论 capture_only / evaluate / live 都跑）
 * - 任何失败都吞掉（内部已 catch，再外层加一层 try/catch 保险）
 * - 返回 void，不影响主流程（调用方不需要 await）
 */
export async function afterInspirationCreatedProcessQuestion(inspiration: {
  id: string
  userId: string
  projectId: string | null
  content: string
  source?: string | null
}): Promise<void> {
  try {
    await normalizeQuestionAndUpsertCard({
      userId: inspiration.userId,
      projectId: inspiration.projectId ?? undefined,
      inspiration: {
        content: inspiration.content,
        source: inspiration.source ?? null,
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn("[user-question-normalize] afterInspirationCreatedProcessQuestion failed:", msg, {
      inspirationId: inspiration.id,
    })
  }
}
