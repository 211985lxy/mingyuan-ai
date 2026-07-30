export const BENCHMARK_RECREATION_SOP_RULES = [
  "先读取已有拆解里的爆款结构逻辑：核心选题、开头机制、观点冲突、情绪触发、正文推进和转化收口。",
  "按这套结构逻辑迁移到我的身份、立场、案例、业务场景和表达方式里，不按原文顺序复述，也不另起一个新主题。",
  "生成前先在内部建立观点池：原文核心观点、评论/争议信号、同类补充角度、反对意见、账号人设经验、行业方法论；观点池不展示，直接输出成稿。",
  "锁定原爆款的核心选题，但必须用我的立场、人设、案例、业务场景和表达方式重构。",
  "成稿必须完成结构重构、观点重构、表达重构，不能只是换词或搬运段落。",
]

export const BENCHMARK_RECREATION_PREFILL = {
  short: "请基于下面这条对标文案和已有拆解，创作成适合我自己的口播文案。",
  long: "请基于下面这条长对标文案和已有拆解，创作一篇适合我自己的完整长篇文案。",
  rewrite: "请按对标原文重新生成一版文案，直接输出最终稿。",
}

export const AIM_OUTPUT_MAX_CHARS = 5000

/**
 * @description 构建爆款选题再创作 SOP 规则文本块（仅供服务端/系统提示注入，不塞进用户输入框）
 * @returns SOP 规则的多行文本
 */
export function buildBenchmarkRecreationSopBlock() {
  return [
    "爆款选题再创作 SOP：",
    ...BENCHMARK_RECREATION_SOP_RULES.map((rule, index) => `${index + 1}. ${rule}`),
  ].join("\n")
}

/**
 * @description 构建对标再创作时用户可见输入：只带意图 + 材料，不塞创作原则/SOP
 */
export function buildBenchmarkMaterialPrefill(input: {
  intent?: keyof typeof BENCHMARK_RECREATION_PREFILL
  videoTitle?: string | null
  transcript?: string | null
  analysis?: string | null
  currentDraft?: string | null
}) {
  const intent = BENCHMARK_RECREATION_PREFILL[input.intent || "short"]
  return [
    intent,
    "",
    input.videoTitle?.trim() ? `对标标题：${input.videoTitle.trim()}` : null,
    input.transcript?.trim() ? `对标原文：\n${input.transcript.trim()}` : null,
    input.analysis?.trim() ? `\n已有拆解：\n${input.analysis.trim()}` : null,
    input.currentDraft?.trim() ? `\n我当前不满意的稿子：\n${input.currentDraft.trim()}` : null,
  ].filter(Boolean).join("\n")
}

/**
 * @description 检测用户输入中是否包含明确的字数要求（如“至少 2000 字”）
 * @param text - 用户输入文本
 * @returns 包含明确字数要求返回 true
 */
export function hasExplicitWordCountRequirement(text: string | null | undefined) {
  const input = text || ""
  return /(?:至少|不少于|不低于|大概|约|控制在|写|生成|输出)?\s*\d{3,5}\s*字/.test(input)
    || /(?:一千|两千|三千|四千|五千|千字|万字)/.test(input)
}

/**
 * @description 检测用户输入中是否包含保持篇幅意图（如“别越改越短”）
 * @param text - 用户输入文本
 * @returns 包含保持篇幅意图返回 true
 */
export function hasWordCountPreservationIntent(text: string | null | undefined) {
  const input = text || ""
  return /(别|不要|不能).{0,6}(越改越短|越写越短|缩水|压缩)/.test(input)
    || /(保持|维持|保留).{0,8}(原稿|原文|原版|当前稿).{0,6}(长度|字数|体量)/.test(input)
    || /(保持|维持|别改短|不要缩短).{0,8}(长度|字数|体量)/.test(input)
    || /(按|照着).{0,6}(原稿|原文|原版).{0,6}(长度|字数|体量)/.test(input)
}

/**
 * @description 构建用户显式字数优先规则（用户字数要求优先于模板默认规则）
 * @param text - 用户输入文本
 * @returns 字数优先规则文本，无显式要求时返回 null
 */
export function buildExplicitWordCountPriorityRule(text: string | null | undefined) {
  if (hasExplicitWordCountRequirement(text)) {
    return `用户输入里已有明确字数要求，必须优先服从用户字数；格式模板的默认字数范围、对标原文字数 95%-105% 和原文字数硬规则都只能作为节奏参考，不能压缩用户要求的长度；但所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字。`
  }
  if (hasWordCountPreservationIntent(text)) {
    return `用户输入里明确表达了保持篇幅、不要越改越短的意图；必须保留当前稿子的主体信息密度和体量，除非用户明确要求精简，否则不要主动压缩长度；但所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字。`
  }
  return null
}

/**
 * @description 构建对标文案字数参考规则（基于原文字数生成 95%-105% 范围）
 * @param transcript - 对标原文转录文本
 * @param userInstruction - 可选的用户指令文本
 * @returns 字数参考规则文本，无法生成时返回 null
 */
export function buildBenchmarkLengthRule(transcript: string | null | undefined, userInstruction?: string | null) {
  const explicitRule = buildExplicitWordCountPriorityRule(userInstruction)
  if (explicitRule) return explicitRule

  const count = (transcript || "").replace(/\s+/g, "").length
  if (count === 0) return null
  const min = Math.max(1, Math.round(count * 0.95))
  const max = Math.min(Math.round(count * 1.05), AIM_OUTPUT_MAX_CHARS)
  const target = Math.min(count, AIM_OUTPUT_MAX_CHARS)
  return `字数参考规则：如果用户没有另写明确字数要求，本次生成的对标改写正文参考对标原文体量；对标原文约 ${count} 字，目标约 ${target} 字，控制在 ${Math.min(min, AIM_OUTPUT_MAX_CHARS)}-${max} 字；如果用户另写了 2000 字、至少 2000 字等明确要求，必须优先服从用户字数，但所有生成内容统一不得超过 ${AIM_OUTPUT_MAX_CHARS} 字。`
}
