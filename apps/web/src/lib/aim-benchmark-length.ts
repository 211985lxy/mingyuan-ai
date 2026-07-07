export const BENCHMARK_RECREATION_SOP_RULES = [
  "先读取已有拆解里的爆款结构逻辑：核心选题、开头机制、观点冲突、情绪触发、正文推进和转化收口。",
  "按这套结构逻辑迁移到我的身份、立场、案例、业务场景和表达方式里，不按原文顺序复述，也不另起一个新主题。",
  "生成前先在内部建立观点池：原文核心观点、评论/争议信号、同类补充角度、反对意见、账号人设经验、行业方法论；观点池不展示，直接输出成稿。",
  "锁定原爆款的核心选题，但必须用我的立场、人设、案例、业务场景和表达方式重构。",
  "成稿必须完成结构重构、观点重构、表达重构，不能只是换词或搬运段落。",
]

export const BENCHMARK_RECREATION_PREFILL = {
  short: "请基于下面这条对标文案和已有拆解，先按拆解好的爆款结构逻辑走，再创作成适合我自己的口播文案。",
  long: "请基于下面这条长对标文案和已有拆解，先按拆解好的爆款结构逻辑走，再创作一篇适合我自己的完整长篇文案。",
}

export function buildBenchmarkRecreationSopBlock() {
  return [
    "爆款选题再创作 SOP：",
    ...BENCHMARK_RECREATION_SOP_RULES.map((rule, index) => `${index + 1}. ${rule}`),
  ].join("\n")
}

export function hasExplicitWordCountRequirement(text: string | null | undefined) {
  const input = text || ""
  return /(?:至少|不少于|不低于|大概|约|控制在|写|生成|输出)?\s*\d{3,5}\s*字/.test(input)
    || /(?:一千|两千|三千|四千|五千|千字|万字)/.test(input)
}

export function hasWordCountPreservationIntent(text: string | null | undefined) {
  const input = text || ""
  return /(别|不要|不能).{0,6}(越改越短|越写越短|缩水|压缩)/.test(input)
    || /(保持|维持|保留).{0,8}(原稿|原文|原版|当前稿).{0,6}(长度|字数|体量)/.test(input)
    || /(保持|维持|别改短|不要缩短).{0,8}(长度|字数|体量)/.test(input)
    || /(按|照着).{0,6}(原稿|原文|原版).{0,6}(长度|字数|体量)/.test(input)
}

export function buildExplicitWordCountPriorityRule(text: string | null | undefined) {
  if (hasExplicitWordCountRequirement(text)) {
    return "用户输入里已有明确字数要求，必须优先服从用户字数；格式模板的默认字数范围、对标原文字数 95%-105% 和原文字数硬规则都只能作为节奏参考，不能压缩用户要求的长度。"
  }
  if (hasWordCountPreservationIntent(text)) {
    return "用户输入里明确表达了保持篇幅、不要越改越短的意图；必须保留当前稿子的主体信息密度和体量，除非用户明确要求精简，否则不要主动压缩长度。"
  }
  return null
}

export function buildBenchmarkLengthRule(transcript: string | null | undefined, userInstruction?: string | null) {
  const explicitRule = buildExplicitWordCountPriorityRule(userInstruction)
  if (explicitRule) return explicitRule

  const count = (transcript || "").replace(/\s+/g, "").length
  if (count === 0) return null
  const min = Math.max(1, Math.round(count * 0.95))
  const max = Math.round(count * 1.05)
  return `字数参考规则：如果用户没有另写明确字数要求，本次生成的对标改写正文参考对标原文体量；对标原文约 ${count} 字，目标约 ${count} 字，控制在 ${min}-${max} 字；如果用户另写了 2000 字、至少 2000 字等明确要求，必须优先服从用户字数。`
}
