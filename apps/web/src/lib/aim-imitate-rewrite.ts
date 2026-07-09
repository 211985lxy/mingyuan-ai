const AIM_IMITATE_REWRITE_MARKER = "[[AIM_IMITATE_REWRITE]]"

const IMITATE_REWRITE_PATTERNS = [
  "仿写这条",
  "按这个出一版",
  "参考这篇重写",
  "自我否定式仿写",
  "故事性仿写",
  "仿写但不抄",
]

export const AIM_IMITATE_REWRITE_SKILL_PROMPT = [
  "请进入正式仿写路由，不要按普通润色处理。",
  "必须显式调用爆款结构与 IP 操盘方法论，先提炼可迁移的钩子、节奏、冲突、转折和结尾。",
  "固定重点调用故事型结构和自我否定型结构，输出仿写优化提示、自我否定版、故事性版。",
].join("")

function normalizeForMatch(text: string) {
  return text.replace(/\s+/g, "")
}

export function hasAimImitateRewriteIntent(raw: string): boolean {
  const normalized = normalizeForMatch(raw)
  return normalized.includes(AIM_IMITATE_REWRITE_MARKER)
    || IMITATE_REWRITE_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export interface BuildAimImitateRewritePromptInput {
  sourceOriginalText: string
  currentDraft?: string
  sourceAnalysisText?: string
  requestText?: string
  longForm?: boolean
}

export function buildAimImitateRewritePrompt(input: BuildAimImitateRewritePromptInput): string {
  const requestText = input.requestText?.trim()
  const sourceAnalysisText = input.sourceAnalysisText?.trim()
  const currentDraft = input.currentDraft?.trim()
  const expressionRule = input.longForm
    ? "两版都按完整长文表达控制，允许更完整的叙事和论证，但仍然只输出这三段结果。"
    : "两版都按短视频口播表达控制，短句、口语、可直接录制。"
  const preferenceRule = requestText
    ? `补充要求：${requestText}`
    : "补充要求：如果用户没有额外偏好，就默认同时给自我否定版和故事性版。"

  return [
    AIM_IMITATE_REWRITE_MARKER,
    "请进入正式「仿写」路由，不要把这次任务当普通改写、轻量润色或自由起稿。",
    "这次必须显式调用上文已经注入的「专业爆款结构库」和「IP操盘方法论」。",
    "先判断原文命中了哪些爆款结构，再开始写。",
    "固定重点调用：故事型结构、自我否定型结构；其余结构只作辅助参考，不要把所有结构堆满。",
    preferenceRule,
    expressionRule,
    "固定输出三段，顺序不可变：",
    "## 仿写优化提示",
    "- 提炼原文可迁移的钩子、节奏、冲突、转折、结尾。",
    "- 点明本次主要调用了哪些爆款结构。",
    "- 明确提醒哪些原文表达、行业词和句式不能照抄。",
    "## 自我否定版",
    "- 结构固定按：旧认知/旧做法 -> 代价或失败 -> 新判断 -> 新方法/行动。",
    "## 故事性版",
    "- 结构固定按：起点 -> 冲突 -> 反转 -> 输出。",
    "硬规则：",
    "1. 两版都必须替换成当前 IP 的人设、行业场景、产品卖点、客户痛点或案例。",
    "2. 不保留对标原文的行业特定词、原句和金句排列。",
    "3. 不要输出方法论解释，不要输出额外版本，不要反问用户。",
    "4. 如果有已有拆解，优先按拆解里的结构逻辑仿写，不要临时猜。",
    "",
    "【对标原文】",
    input.sourceOriginalText.trim(),
    ...(sourceAnalysisText ? ["", "【已有拆解】", sourceAnalysisText] : []),
    ...(currentDraft ? ["", "【当前草稿/当前方向】", currentDraft] : []),
  ].join("\n")
}
