/**
 * 小红书图文编辑工具（纯函数，零依赖，可单测）
 *
 * 方法论内化自开源 rednote-director-skill（SKILL.md）：
 * - 笔记结构：3:4 图文、封面强钩子、内页递进、标题 5-10 候选、正文、标签、评论区引导
 * - 自检清单：封面钩子 / 手机端可读性 / 信息层级 / 风格统一 / 收藏价值 /
 *   避免模板感（PPT 感）/ 避免大段文字堆积 / emoji 克制
 * - 文案要短、狠、清晰
 *
 * 本文件分三块能力：
 * 1. 确定性检查：emoji 密度、广告法绝对化用语、标题长度、段落堆积（本地计算）
 * 2. LLM 输出解析：把模型返回的 JSON 块稳健解析为结构化结果（容错降级）
 * 3. 笔记结构：标题（≤20 字）/ 正文分段 / 话题标签位 的模板整理
 */

export interface XhsReviewIssue {
  /** emoji | spoken | absolute | title | structure | hook | readability | collection */
  type: string
  text: string
  suggestion: string
}

/** 自检清单项（rednote-director 自检维度） */
export interface XhsChecklistItem {
  /** hook 封面钩子 | readability 手机端可读性 | hierarchy 信息层级 | style 风格统一 |
   *  collection 收藏价值 | template 模板感 | density 文字堆积 | emoji emoji克制 |
   *  absolute 绝对化用语 | title 标题长度 */
  item: string
  status: "pass" | "warn" | "fail"
  note?: string
}

export interface XhsReviewResult {
  score: number
  issues: XhsReviewIssue[]
  checklist: XhsChecklistItem[]
  emojiDensity: number // 每 100 字 emoji 数
}

export interface XhsTitleVariants {
  titles: string[]
  hooks: string[]
  tags: string[]
}

/** 自检维度中文名（prompt 与 UI 共用，保证 LLM 输出可对齐） */
export const XHS_CHECKLIST_LABELS: Record<string, string> = {
  hook: "封面钩子",
  readability: "手机端可读性",
  hierarchy: "信息层级",
  style: "风格统一",
  collection: "收藏价值",
  template: "避免模板感",
  density: "避免文字堆积",
  emoji: "emoji 克制",
  absolute: "绝对化用语",
  title: "标题长度",
}

// ─── emoji 密度 ─────────────────────────────────────────

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu

/** 每 100 字的 emoji 个数（保留 1 位小数） */
export function computeEmojiDensity(text: string): number {
  const chars = text.replace(/\s/g, "")
  if (!chars) return 0
  const emojiCount = (text.match(EMOJI_REGEX) || []).length
  return Math.round((emojiCount / chars.length) * 1000) / 10
}

/** emoji 克制检查：< 0.5/百字 提示补充，> 3/百字 提示收敛（小红书正文经验区间） */
export function checkEmojiDensity(text: string): { density: number; issue: XhsReviewIssue | null } {
  const density = computeEmojiDensity(text)
  if (density < 0.5) {
    return {
      density,
      issue: {
        type: "emoji",
        text: `emoji 密度偏低（${density}/百字）`,
        suggestion: "小红书正文通常每 1-2 句带 1 个 emoji，在句首或关键词后补充相关 emoji 提升笔记感。",
      },
    }
  }
  if (density > 3) {
    return {
      density,
      issue: {
        type: "emoji",
        text: `emoji 密度偏高（${density}/百字）`,
        suggestion: "emoji 过密会显得像营销号，收敛到每 2-3 句 1 个，优先保留句首的功能性 emoji。",
      },
    }
  }
  return { density, issue: null }
}

// ─── 广告法绝对化用语 ────────────────────────────────────

/** 广告法高风险绝对化用语（节选高频项，按长词优先匹配） */
export const XHS_ABSOLUTE_TERMS = [
  "国家级",
  "世界级",
  "全球首发",
  "全网最低价",
  "第一品牌",
  "销量第一",
  "排名第一",
  "最先进",
  "最专业",
  "最受欢迎",
  "最安全",
  "最有效",
  "最便宜",
  "最好",
  "最强",
  "最大",
  "最高",
  "最低",
  "第一",
  "唯一",
  "首个",
  "首选",
  "顶级",
  "极致",
  "绝对",
  "永久",
  "万能",
  "100%",
] as const

/** 扫描正文里的绝对化用语（去重，取首次出现位置的上下文） */
export function findAbsoluteTerms(text: string): XhsReviewIssue[] {
  const issues: XhsReviewIssue[] = []
  const seen = new Set<string>()
  for (const term of XHS_ABSOLUTE_TERMS) {
    if (seen.has(term)) continue
    const index = text.indexOf(term)
    if (index < 0) continue
    seen.add(term)
    const start = Math.max(0, index - 6)
    const context = text.slice(start, index + term.length + 6).replace(/\n/g, " ")
    issues.push({
      type: "absolute",
      text: `疑似广告法绝对化用语「${term}」（…${context}…）`,
      suggestion: "改为可验证的表达，如「我用过复购最多的」「团队实测效果不错的」，避免「最/第一/国家级」等绝对化表述。",
    })
  }
  return issues
}

// ─── 本地确定性自检清单 ──────────────────────────────────

/** 标题长度检查：小红书建议 ≤20 字（emoji 不计） */
export function checkXhsTitle(title: string): XhsReviewIssue | null {
  const length = title.replace(EMOJI_REGEX, "").trim().length
  if (!length) {
    return { type: "title", text: "缺少标题", suggestion: "补一条 20 字以内、带具体数字或结果的标题。" }
  }
  if (length > 20) {
    return {
      type: "title",
      text: `标题 ${length} 字，超出建议的 20 字`,
      suggestion: "压缩到 20 字以内：删掉修饰词，只留「人群 + 结果/数字 + 钩子」。",
    }
  }
  return null
}

/** 文字堆积检查：是否存在超过 5 行不换段的文字块（手机端可读性差） */
export function findDenseParagraphs(text: string): boolean {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .some((paragraph) => paragraph.split("\n").filter((line) => line.trim()).length > 5)
}

/**
 * 本地自检清单（不消耗 token 的确定性维度）：
 * emoji 克制 / 绝对化用语 / 标题长度 / 文字堆积。
 * 其余定性维度（封面钩子/可读性/层级/风格/收藏/模板感）由 LLM 补齐后合并。
 */
export function buildLocalChecklist(title: string, content: string): XhsChecklistItem[] {
  const { density, issue: emojiIssue } = checkEmojiDensity(content)
  const absoluteIssues = findAbsoluteTerms(content)
  const titleIssue = checkXhsTitle(title)
  const dense = findDenseParagraphs(content)
  return [
    {
      item: "emoji",
      status: emojiIssue ? "warn" : "pass",
      note: `emoji 密度 ${density}/百字（建议 0.5-3）`,
    },
    {
      item: "absolute",
      status: absoluteIssues.length ? "fail" : "pass",
      note: absoluteIssues.length ? `命中 ${absoluteIssues.length} 处绝对化用语` : "未发现绝对化用语",
    },
    {
      item: "title",
      status: titleIssue ? "warn" : "pass",
      note: titleIssue ? titleIssue.text : "标题长度合规",
    },
    {
      item: "density",
      status: dense ? "warn" : "pass",
      note: dense ? "存在超过 5 行不换段的文字块" : "段落留白正常",
    },
  ]
}

// ─── LLM 输出解析（容错） ───────────────────────────────

/** 从模型输出中提取第一个 JSON 对象（提取第一个 { 到最后一个 }，容忍 ```json 代码块与前后废话） */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeIssue(item: unknown): XhsReviewIssue | null {
  if (!item || typeof item !== "object") return null
  const record = item as Record<string, unknown>
  const text = typeof record.text === "string" ? record.text.trim() : ""
  if (!text) return null
  return {
    type: typeof record.type === "string" ? record.type : "structure",
    text,
    suggestion: typeof record.suggestion === "string" ? record.suggestion : "",
  }
}

function normalizeChecklistItem(item: unknown): XhsChecklistItem | null {
  if (!item || typeof item !== "object") return null
  const record = item as Record<string, unknown>
  const name = typeof record.item === "string" ? record.item.trim() : ""
  if (!name) return null
  const status =
    record.status === "fail" ? "fail" : record.status === "warn" ? "warn" : "pass"
  return {
    item: name,
    status,
    note: typeof record.note === "string" ? record.note : undefined,
  }
}

/** 解析风格检查 LLM 输出：{ score, issues, checklist }，字段缺失时给安全默认 */
export function parseXhsReviewPayload(raw: string): {
  score: number
  issues: XhsReviewIssue[]
  checklist: XhsChecklistItem[]
} {
  const parsed = extractJsonObject(raw)
  if (!parsed) return { score: 0, issues: [], checklist: [] }
  const score =
    typeof parsed.score === "number" && Number.isFinite(parsed.score)
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : 0
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map(normalizeIssue).filter((issue): issue is XhsReviewIssue => issue !== null)
    : []
  const checklist = Array.isArray(parsed.checklist)
    ? parsed.checklist
        .map(normalizeChecklistItem)
        .filter((item): item is XhsChecklistItem => item !== null)
    : []
  return { score, issues, checklist }
}

/** 解析标题/钩子/标签变体 LLM 输出：{ titles, hooks, tags }，过滤空串并去重 */
export function parseXhsVariantsPayload(raw: string): XhsTitleVariants {
  const parsed = extractJsonObject(raw)
  if (!parsed) return { titles: [], hooks: [], tags: [] }
  const pick = (value: unknown): string[] =>
    Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))]
      : []
  return { titles: pick(parsed.titles), hooks: pick(parsed.hooks), tags: pick(parsed.tags) }
}

// ─── 笔记结构模板 ───────────────────────────────────────

/** 从正文提取已有话题标签（#标签） */
export function extractXhsTags(text: string): string[] {
  const matches = text.match(/#[^\s#]+/g) || []
  return [...new Set(matches.map((tag) => tag.slice(1)))]
}

/**
 * 一键按模板整理：把当前正文组织为 标题 / 正文 / 话题标签 三段。
 * 已有 #标签 汇集到标签段；标题取首行（≤20 字），正文分段落。
 */
export function buildXhsNoteDraft(content: string): string {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const tags = extractXhsTags(content)
  // 去掉正文中行内的 #标签，统一收拢到标签段
  const bodyLines = lines.map((line) => line.replace(/#[^\s#]+/g, "").trim())
  const firstNonEmpty = bodyLines.find((line) => line.trim()) || ""
  const title = firstNonEmpty.slice(0, 20)
  const rest = bodyLines.slice(bodyLines.indexOf(firstNonEmpty) + 1).join("\n").trim()

  return [
    `【标题】${title || "（20 字以内，带 1-2 个 emoji）"}`,
    "",
    "【正文】",
    rest || "（分段书写，每段 1-3 句，段间空行）",
    "",
    `【话题标签】${tags.length ? tags.map((tag) => `#${tag}`).join(" ") : "#此处填话题标签"}`,
  ].join("\n")
}
