/**
 * 知识分类唯一事实源。
 * 全项目所有分类值、标签、默认分级、项目绑定规则均从此文件 import。
 * 禁止在其他文件定义 CATEGORY_LABELS / KNOWLEDGE_CATEGORIES 常量（ESLint 守卫强制）。
 */

export const KNOWLEDGE_CATEGORIES = [
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
  "writing_style_profile",
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<string, string> = {
  boss_experience: "老板经验",
  product_usp: "产品卖点",
  customer_pain: "客户痛点",
  project_case: "项目案例",
  customer_qa: "客户问答",
  daily_inspiration: "日常灵感",
  benchmark_reference: "竞品/对标参考",
  user_insight: "用户洞察",
  hot_topic: "热点素材",
  positioning_material: "定位素材",
  private_domain_material: "私域素材",
  writing_style_profile: "写作风格档案",
}

export const SOURCE_TYPES = [
  "manual",
  "voice_transcribe",
  "import",
  "obsidian",
  "smart_import",
  "meeting_insight",
] as const

export type KnowledgeSourceType = (typeof SOURCE_TYPES)[number]

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  manual: "手动录入",
  voice_transcribe: "语音转写",
  import: "文件导入",
  obsidian: "Obsidian 同步",
  smart_import: "智能导入",
  meeting_insight: "会议洞察",
}

export const PROJECT_REQUIRED_CATEGORIES: ReadonlySet<string> = new Set([
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
])

export function isKnowledgeCategory(value: unknown): value is KnowledgeCategory {
  return typeof value === "string" && (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value)
}

export function isKnowledgeSourceType(value: unknown): value is KnowledgeSourceType {
  return typeof value === "string" && (SOURCE_TYPES as readonly string[]).includes(value)
}

/**
 * 资产层级分组（UI 展示和策略画像用，不改数据库）。
 */
export const CATEGORY_GROUPS = {
  "IP 核心资产": ["boss_experience", "positioning_material", "writing_style_profile"],
  "转化资产": ["product_usp", "customer_pain", "customer_qa", "project_case", "private_domain_material"],
  "流量资产": ["daily_inspiration", "benchmark_reference", "user_insight", "hot_topic"],
} as const
