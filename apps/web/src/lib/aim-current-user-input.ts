const AIM_GENERATE_INPUT_MARKER = "【本次生成输入】"

/**
 * 素材段落结构标记：出现在任一标记之前的内容视为「用户指令」，之后视为「粘贴素材」。
 * 指令/素材分离的单一真源（2026-09 系列事故根治）：所有入口层规则只对指令部分
 * 做字面匹配，素材里的词（反问钩子/「开头」/「这段」/#tag）不再冒充用户意图。
 */
export const AIM_MATERIAL_SECTION_MARKERS = [
  "对标标题：",
  "对标原文：",
  "对标文案：",
  "已有拆解：",
  "结构化拆解：",
  "改写原则：",
  "创作原则：",
  "【待修改原文】",
  "【待质检原文】",
  "【发布数据原文】",
  "【参考材料：",
  "【当前作品】",
  "【最近对话】",
  "【对话摘要】",
  "【有界检索笔记】",
] as const

/** 对标粘贴的结构标记（带冒号的段落头）；口头提到「对标文案」不带冒号不算 */
export const AIM_BENCHMARK_MATERIAL_PATTERN = /对标标题[：:]|对标原文[：:]|对标文案[：:]/

/**
 * 从含粘贴素材/历史拼接的原始输入中抽取「用户指令」部分。
 * 组合两步：先取最新指令段（【本次生成输入】标记 / 最后一条「用户：」行 / 整段），
 * 再在指令段内按素材标记截断。纯粘贴（无指令）返回空串——调用方按「无指令」
 * 处理而不是回退整段，否则分离失效。
 */
export function extractAimInstructionText(raw: string): string {
  const text = (raw || "").trim()
  if (!text) return ""

  const latest = extractLatestAimUserIntentText(text)
  let cut = -1
  for (const marker of AIM_MATERIAL_SECTION_MARKERS) {
    const index = latest.indexOf(marker)
    if (index >= 0 && (cut < 0 || index < cut)) cut = index
  }
  if (cut < 0) return latest
  return latest.slice(0, cut).trim()
}

/** 素材字符量（用于可观测与快径门控） */
export function countAimMaterialChars(raw: string): number {
  const text = (raw || "").trim()
  if (!text) return 0
  const instruction = extractAimInstructionText(raw)
  return text.length - instruction.length
}

const DIRECT_DRAFT_PATTERNS = [
  "直接生成文案",
  "直接生成长文",
  "直接写文案",
  "直接写正文",
  "直接写长文",
  "直接给我文案",
  "直接给我全文",
  "直接出稿",
  "直接成稿",
  "不要框架",
  "别给框架",
  "不用先框架",
  "不用分析",
  "不用再分析",
  "不要分析",
  "不要再分析",
  "别分析了",
  "别再分析",
  "不要再问",
  "别问了",
]

function normalizeForMatch(text: string) {
  return text.replace(/\s+/g, "")
}

/**
 * @description 从原始输入中提取最新的用户意图文本
 * @param raw - 原始输入文本
 * @returns 提取的用户意图文本
 */
export function extractLatestAimUserIntentText(raw: string): string {
  const text = raw.trim()
  if (!text) return ""

  const markerIndex = text.lastIndexOf(AIM_GENERATE_INPUT_MARKER)
  if (markerIndex >= 0) {
    const section = text.slice(markerIndex + AIM_GENERATE_INPUT_MARKER.length).trim()
    if (section) return section
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line.startsWith("用户：")) {
      const content = line.slice("用户：".length).trim()
      if (content) return content
    }
  }

  return text
}

/**
 * @description 判断用户是否有明确的直接成稿意图
 * @param raw - 原始输入文本
 * @returns 有直接成稿意图返回 true
 */
export function hasExplicitDirectDraftIntent(raw: string): boolean {
  const text = normalizeForMatch(extractLatestAimUserIntentText(raw))
  return DIRECT_DRAFT_PATTERNS.some((pattern) => text.includes(pattern))
}

const WECHAT_DRAFT_PATTERNS = [
  "推到草稿箱",
  "推到公众号草稿箱",
  "保存到草稿箱",
  "发布到公众号",
  "推到公众号",
]

/**
 * @description 判断用户是否有微信公众号草稿箱发布意图
 * @param raw - 原始输入文本
 * @returns 有微信草稿意图返回 true
 */
export function hasWechatDraftIntent(raw: string): boolean {
  const text = normalizeForMatch(extractAimInstructionText(raw))
  return WECHAT_DRAFT_PATTERNS.some((pattern) => text.includes(pattern))
}
