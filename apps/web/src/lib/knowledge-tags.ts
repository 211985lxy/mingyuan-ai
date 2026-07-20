export type KnowledgeScope = "ip" | "project"
export type KnowledgeAssetRole =
  | "story"
  | "proof"
  | "judgment"
  | "usp"
  | "pain"
  | "case"
  | "benchmark"
  | "inspiration"
  | "strategy"
export type KnowledgeUsableFor = "xhs" | "wechat" | "video" | "sales" | "topic"
export type KnowledgeConfidence = "confirmed" | "user_claim" | "pending_verify"

/** 价值分级：S(战略)/A(战术)/B(参考)/C(索引)，与 confidence 正交，管"重不重要" */
export type KnowledgeValueGrade = "S" | "A" | "B" | "C"

export const VALUE_GRADES = new Set<KnowledgeValueGrade>(["S", "A", "B", "C"])

/**
 * 校验并归一化价值分级。
 * 接受 "S"/"A"/"B"/"C"（大小写不敏感），非法/空值返回 null（入库为 null，检索视为 B）。
 */
/**
 * @description 标准化valuegrade
 * @param value - 值
 * @returns KnowledgeValueGrade | null
 */
export function normalizeValueGrade(value: unknown): KnowledgeValueGrade | null {
  if (typeof value !== "string") return null
  const upper = value.trim().toUpperCase()
  return VALUE_GRADES.has(upper as KnowledgeValueGrade) ? (upper as KnowledgeValueGrade) : null
}

export interface ParsedKnowledgeTags {
  scope: KnowledgeScope | null
  assetRole: KnowledgeAssetRole | null
  usableFor: KnowledgeUsableFor[]
  confidence: KnowledgeConfidence | null
  otherTags: string[]
  isCleaned: boolean
}

const SCOPES = new Set<KnowledgeScope>(["ip", "project"])
const ROLES = new Set<KnowledgeAssetRole>([
  "story",
  "proof",
  "judgment",
  "usp",
  "pain",
  "case",
  "benchmark",
  "inspiration",
  "strategy",
])
const USABLE_FOR = new Set<KnowledgeUsableFor>(["xhs", "wechat", "video", "sales", "topic"])
const CONFIDENCES = new Set<KnowledgeConfidence>(["confirmed", "user_claim", "pending_verify"])

/**
 * @description 解析knowledgetags
 * @param tags - 标签列表
 * @returns ParsedKnowledgeTags
 */
export function parseKnowledgeTags(tags: unknown): ParsedKnowledgeTags {
  const values = Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === "string")
    : []
  let scope: KnowledgeScope | null = null
  let assetRole: KnowledgeAssetRole | null = null
  let confidence: KnowledgeConfidence | null = null
  const usableFor: KnowledgeUsableFor[] = []
  const otherTags: string[] = []

  for (const tag of values) {
    const [key, value] = tag.split(":", 2)
    if (key === "kb_scope" && SCOPES.has(value as KnowledgeScope)) {
      scope = value as KnowledgeScope
    } else if (key === "asset_role" && ROLES.has(value as KnowledgeAssetRole)) {
      assetRole = value as KnowledgeAssetRole
    } else if (key === "usable_for" && USABLE_FOR.has(value as KnowledgeUsableFor)) {
      usableFor.push(value as KnowledgeUsableFor)
    } else if (key === "confidence" && CONFIDENCES.has(value as KnowledgeConfidence)) {
      confidence = value as KnowledgeConfidence
    } else {
      otherTags.push(tag)
    }
  }

  return {
    scope,
    assetRole,
    usableFor: [...new Set(usableFor)],
    confidence,
    otherTags,
    isCleaned: Boolean(scope || assetRole || confidence || usableFor.length),
  }
}

/**
 * @description 合并knowledgetags
 * @param current - 当前值
 * @param next - 下一步处理函数
 * @returns string[]
 */
export function mergeKnowledgeTags(current: unknown, next: string[]): string[] {
  const values = Array.isArray(current)
    ? current.filter((tag): tag is string => typeof tag === "string")
    : []
  return [...new Set([...values, ...next])]
}

/**
 * @description 构建defaultknowledgetags
 * @param category - 分类
 * @returns string[]
 */
export function buildDefaultKnowledgeTags(category: string): string[] {
  if (category === "daily_inspiration" || category === "hot_topic") {
    return ["kb_scope:project", "asset_role:inspiration", "usable_for:topic", "confidence:user_claim"]
  }
  if (category === "meeting_minutes") {
    return ["kb_scope:project", "asset_role:judgment", "usable_for:topic", "usable_for:video", "usable_for:sales", "confidence:user_claim"]
  }
  if (category === "benchmark_reference") {
    return ["kb_scope:project", "asset_role:benchmark", "usable_for:topic", "confidence:user_claim"]
  }
  if (category === "user_insight" || category === "customer_pain") {
    return ["kb_scope:project", "asset_role:pain", "usable_for:topic", "usable_for:sales", "confidence:user_claim"]
  }
  if (category === "product_usp") {
    return ["kb_scope:project", "asset_role:usp", "usable_for:sales", "usable_for:topic", "confidence:user_claim"]
  }
  if (category === "project_case") {
    return ["kb_scope:project", "asset_role:case", "usable_for:sales", "usable_for:wechat", "confidence:user_claim"]
  }
  if (category === "boss_experience" || category === "positioning_material") {
    return ["kb_scope:ip", "asset_role:story", "usable_for:xhs", "usable_for:wechat", "usable_for:video", "confidence:user_claim"]
  }
  // IP 写作风格档案：用户级全局（kb_scope:ip），本质是判断/价值观资产（asset_role:judgment）
  if (category === "writing_style_profile") {
    return ["kb_scope:ip", "asset_role:judgment", "usable_for:video", "usable_for:wechat", "usable_for:xhs", "confidence:user_claim"]
  }
  return ["confidence:user_claim"]
}

/**
 * @description 构建knowledgecleaningsuggestion
 * @param input - 输入数据
 * @returns string[]
 */
export function buildKnowledgeCleaningSuggestion(input: {
  category: string
  title: string
  content: string
  tags?: unknown
}): string[] {
  const text = `${input.title} ${input.content}`
  let defaults = buildDefaultKnowledgeTags(input.category)

  if (/质疑|反驳|回应|信任|证明|背书/.test(text)) {
    defaults = ["kb_scope:ip", "asset_role:proof", "usable_for:xhs", "usable_for:wechat", "usable_for:sales", "confidence:user_claim"]
  } else if (/行业判断|核心观点|价值观|三观|行业趋势|反常识/.test(text)) {
    defaults = ["kb_scope:ip", "asset_role:judgment", "usable_for:xhs", "usable_for:wechat", "usable_for:topic", "confidence:user_claim"]
  } else if (/价格|定价|成交|转化|购买|咨询|私域/.test(text)) {
    defaults = ["kb_scope:project", "asset_role:usp", "usable_for:sales", "confidence:user_claim"]
  }

  return mergeKnowledgeTags(input.tags, defaults)
}

/**
 * @description knowledgecleanuplabel
 * @param parsed - 解析后的数据
 * @returns string
 */
export function knowledgeCleanupLabel(parsed: ParsedKnowledgeTags): string {
  if (!parsed.isCleaned) return "未清洗"
  const scope = parsed.scope === "ip" ? "IP资产" : parsed.scope === "project" ? "项目资产" : "未分层"
  const confidence = parsed.confidence === "pending_verify" ? "待核验" : parsed.confidence === "confirmed" ? "已确认" : "用户叙事"
  return `${scope} · ${confidence}`
}
