/**
 * 知识资产健康度（阶段 1）
 *
 * 不改 KnowledgeEntry.category（12 类），只做前台确定性聚合：
 * - 五个企业事实盒子
 * - 动态素材池（不计入五盒健康度）
 * - 状态仅：已具备 / 待补充 / 待确认（无百分制）
 */

import type { KnowledgeCategory } from "@/lib/knowledge-categories"
import { parseKnowledgeTags } from "@/lib/knowledge-tags"

export const HEALTH_STATUSES = ["ready", "missing", "pending_confirm"] as const
export type KnowledgeAssetHealthStatus = (typeof HEALTH_STATUSES)[number]

export const HEALTH_STATUS_LABELS: Record<KnowledgeAssetHealthStatus, "已具备" | "待补充" | "待确认"> = {
  ready: "已具备",
  missing: "待补充",
  pending_confirm: "待确认",
}

export const ASSET_BOX_IDS = [
  "who_am_i",
  "what_i_sell",
  "why_trust_me",
  "customer_thinking",
  "how_i_convert",
] as const

export type AssetBoxId = (typeof ASSET_BOX_IDS)[number]

export const DYNAMIC_POOL_CATEGORIES = [
  "hot_topic",
  "benchmark_reference",
  "daily_inspiration",
] as const

export type DynamicPoolCategory = (typeof DYNAMIC_POOL_CATEGORIES)[number]

export type AssetBucket = AssetBoxId | "dynamic_pool"

export interface AssetBoxDefinition {
  id: AssetBoxId
  label: string
  question: string
  categories: readonly KnowledgeCategory[]
}

export const ASSET_BOX_DEFINITIONS: readonly AssetBoxDefinition[] = [
  {
    id: "who_am_i",
    label: "我是谁",
    question: "谁在表达，为什么值得听",
    categories: ["boss_experience", "positioning_material", "writing_style_profile"],
  },
  {
    id: "what_i_sell",
    label: "我卖什么",
    question: "提供什么结果，适合谁",
    categories: ["product_usp"],
  },
  {
    id: "why_trust_me",
    label: "为什么相信我",
    question: "有什么真实证据",
    categories: ["project_case"],
  },
  {
    id: "customer_thinking",
    label: "客户在想什么",
    question: "客户为什么犹豫和行动",
    categories: ["customer_pain", "customer_qa", "user_insight"],
  },
  {
    id: "how_i_convert",
    label: "我怎么承接",
    question: "内容之后让用户做什么",
    categories: ["private_domain_material"],
  },
] as const

const CATEGORY_TO_BUCKET: Record<KnowledgeCategory, AssetBucket> = {
  boss_experience: "who_am_i",
  positioning_material: "who_am_i",
  writing_style_profile: "who_am_i",
  product_usp: "what_i_sell",
  project_case: "why_trust_me",
  customer_pain: "customer_thinking",
  customer_qa: "customer_thinking",
  user_insight: "customer_thinking",
  private_domain_material: "how_i_convert",
  hot_topic: "dynamic_pool",
  benchmark_reference: "dynamic_pool",
  daily_inspiration: "dynamic_pool",
}

const SUPPLEMENT_PROMPTS: Record<AssetBoxId, Partial<Record<KnowledgeCategory, string[]>>> = {
  who_am_i: {
    positioning_material: [
      "你的账号/个人定位一句话是什么？",
      "你希望客户记住你的专业身份是什么？",
      "你主要服务哪类人？",
    ],
    writing_style_profile: [
      "有没有一段你满意的成稿，可当写作样本？",
      "你平时说话有哪些固定习惯或禁忌？",
    ],
    boss_experience: [
      "有哪段经历最能说明你为什么懂这件事？",
      "客户最常被你哪段故事打动？",
    ],
  },
  what_i_sell: {
    product_usp: [
      "你主推的产品/服务解决什么结果？",
      "和同类方案比，你最硬的差异是什么？",
      "适合谁买、不适合谁买？",
    ],
  },
  why_trust_me: {
    project_case: [
      "有没有一个可公开的真实客户案例？",
      "案例里可核实的数字或结果是什么？",
      "过程中哪一步最能证明专业度？",
    ],
  },
  customer_thinking: {
    customer_pain: [
      "目标客户现在最卡在哪一步？",
      "他们最常说的犹豫或反对意见是什么？",
      "他们已经试过哪些无效办法？",
    ],
    customer_qa: ["客户最常问你的三个问题是什么？"],
    user_insight: ["最近一次和客户深聊，你听到了什么新洞察？"],
  },
  how_i_convert: {
    private_domain_material: [
      "内容看完后，你希望对方立刻做什么？",
      "加微信/私域后的第一句话怎么说？",
      "有没有现成的承接话术或路径？",
    ],
  },
}

export interface KnowledgeAssetEntryInput {
  id?: string
  category: string
  status?: string | null
  tags?: unknown
}

export interface AssetBoxHealth {
  id: AssetBoxId
  label: string
  question: string
  categories: readonly KnowledgeCategory[]
  status: KnowledgeAssetHealthStatus
  statusLabel: "已具备" | "待补充" | "待确认"
  entryCount: number
  pendingVerifyCount: number
  missingCategories: KnowledgeCategory[]
  /** 点击「待补充」时优先引导补录的分类 */
  suggestedCategory: KnowledgeCategory | null
}

export interface KnowledgeAssetHealthResult {
  boxes: AssetBoxHealth[]
  dynamicPool: {
    label: "动态素材池"
    categories: readonly DynamicPoolCategory[]
    count: number
  }
}

/**
 * @description 将 12 类知识映射到五盒或动态素材池
 */
export function mapCategoryToBucket(category: string): AssetBucket | "unknown" {
  if ((DYNAMIC_POOL_CATEGORIES as readonly string[]).includes(category)) return "dynamic_pool"
  const box = CATEGORY_TO_BUCKET[category as KnowledgeCategory]
  return box ?? "unknown"
}

/**
 * @description 返回分类所属资产盒子；动态素材返回 null
 */
export function getAssetBoxForCategory(category: string): AssetBoxDefinition | null {
  const bucket = mapCategoryToBucket(category)
  if (bucket === "dynamic_pool" || bucket === "unknown") return null
  return ASSET_BOX_DEFINITIONS.find((box) => box.id === bucket) ?? null
}

/**
 * @description 返回缺口补录引导问题（1—3 条）
 */
export function getSupplementPrompts(boxId: AssetBoxId, category: KnowledgeCategory): string[] {
  const prompts = SUPPLEMENT_PROMPTS[boxId]?.[category] ?? []
  return prompts.slice(0, 3)
}

function isActiveEntry(entry: KnowledgeAssetEntryInput): boolean {
  return (entry.status ?? "active") === "active"
}

function isPendingVerify(entry: KnowledgeAssetEntryInput): boolean {
  return parseKnowledgeTags(entry.tags).confidence === "pending_verify"
}

function isConfirmed(entry: KnowledgeAssetEntryInput): boolean {
  return parseKnowledgeTags(entry.tags).confidence === "confirmed"
}

/** 可用于「已具备」的条目：非 pending_verify */
function isUsable(entry: KnowledgeAssetEntryInput): boolean {
  return !isPendingVerify(entry)
}

function hasUsableCategory(
  entries: KnowledgeAssetEntryInput[],
  category: KnowledgeCategory,
): boolean {
  return entries.some((entry) => entry.category === category && isUsable(entry))
}

function hasAnyCategory(
  entries: KnowledgeAssetEntryInput[],
  category: KnowledgeCategory,
): boolean {
  return entries.some((entry) => entry.category === category)
}

function evaluateWhoAmI(entries: KnowledgeAssetEntryInput[]): {
  status: KnowledgeAssetHealthStatus
  missingCategories: KnowledgeCategory[]
  suggestedCategory: KnowledgeCategory | null
} {
  const missing: KnowledgeCategory[] = []
  const hasPositioningUsable = hasUsableCategory(entries, "positioning_material")
  const hasPositioningAny = hasAnyCategory(entries, "positioning_material")
  const hasStyleOrExperienceUsable =
    hasUsableCategory(entries, "writing_style_profile") ||
    hasUsableCategory(entries, "boss_experience")
  const hasStyleOrExperienceAny =
    hasAnyCategory(entries, "writing_style_profile") || hasAnyCategory(entries, "boss_experience")

  if (!hasPositioningAny) missing.push("positioning_material")
  if (!hasStyleOrExperienceAny) {
    // 优先引导写作风格；也可用老板经验替代
    missing.push("writing_style_profile")
  }

  if (missing.length > 0) {
    return {
      status: "missing",
      missingCategories: missing,
      suggestedCategory: missing[0] ?? null,
    }
  }

  if (hasPositioningUsable && hasStyleOrExperienceUsable) {
    return { status: "ready", missingCategories: [], suggestedCategory: null }
  }

  const suggested: KnowledgeCategory = !hasPositioningUsable
    ? "positioning_material"
    : hasAnyCategory(entries, "writing_style_profile")
      ? "writing_style_profile"
      : "boss_experience"

  return {
    status: "pending_confirm",
    missingCategories: [],
    suggestedCategory: suggested,
  }
}

function evaluateSimpleBox(
  entries: KnowledgeAssetEntryInput[],
  required: KnowledgeCategory,
  options?: { requireConfirmed?: boolean },
): {
  status: KnowledgeAssetHealthStatus
  missingCategories: KnowledgeCategory[]
  suggestedCategory: KnowledgeCategory | null
} {
  const inCategory = entries.filter((entry) => entry.category === required)
  if (inCategory.length === 0) {
    return {
      status: "missing",
      missingCategories: [required],
      suggestedCategory: required,
    }
  }

  if (options?.requireConfirmed) {
    if (inCategory.some(isConfirmed)) {
      return { status: "ready", missingCategories: [], suggestedCategory: null }
    }
    return {
      status: "pending_confirm",
      missingCategories: [],
      suggestedCategory: required,
    }
  }

  if (inCategory.some(isUsable)) {
    return { status: "ready", missingCategories: [], suggestedCategory: null }
  }

  return {
    status: "pending_confirm",
    missingCategories: [],
    suggestedCategory: required,
  }
}

function evaluateCustomerThinking(entries: KnowledgeAssetEntryInput[]): {
  status: KnowledgeAssetHealthStatus
  missingCategories: KnowledgeCategory[]
  suggestedCategory: KnowledgeCategory | null
} {
  // 客户痛点是硬门槛；问答/洞察计入数量但不单独视为已具备
  return evaluateSimpleBox(entries, "customer_pain")
}

/**
 * @description 确定性计算项目知识资产健康度（可重复、无 LLM）
 */
export function computeKnowledgeAssetHealth(
  entries: readonly KnowledgeAssetEntryInput[],
): KnowledgeAssetHealthResult {
  const active = entries.filter(isActiveEntry)
  const dynamicPoolEntries = active.filter(
    (entry) => mapCategoryToBucket(entry.category) === "dynamic_pool",
  )

  const boxes: AssetBoxHealth[] = ASSET_BOX_DEFINITIONS.map((definition) => {
    const boxEntries = active.filter((entry) =>
      (definition.categories as readonly string[]).includes(entry.category),
    )
    const evaluation =
      definition.id === "who_am_i"
        ? evaluateWhoAmI(boxEntries)
        : definition.id === "customer_thinking"
          ? evaluateCustomerThinking(boxEntries)
          : definition.id === "why_trust_me"
            ? evaluateSimpleBox(boxEntries, "project_case", { requireConfirmed: true })
            : definition.id === "what_i_sell"
              ? evaluateSimpleBox(boxEntries, "product_usp")
              : evaluateSimpleBox(boxEntries, "private_domain_material")

    return {
      id: definition.id,
      label: definition.label,
      question: definition.question,
      categories: definition.categories,
      status: evaluation.status,
      statusLabel: HEALTH_STATUS_LABELS[evaluation.status],
      entryCount: boxEntries.length,
      pendingVerifyCount: boxEntries.filter(isPendingVerify).length,
      missingCategories: evaluation.missingCategories,
      suggestedCategory: evaluation.suggestedCategory,
    }
  })

  return {
    boxes,
    dynamicPool: {
      label: "动态素材池",
      categories: DYNAMIC_POOL_CATEGORIES,
      count: dynamicPoolEntries.length,
    },
  }
}

/** 统计五盒中「已具备」的数量（分母固定为 ASSET_BOX_IDS.length）。 */
export function countReadyAssetBoxes(health: KnowledgeAssetHealthResult | null | undefined): {
  ready: number
  total: number
} {
  const total = ASSET_BOX_IDS.length
  if (!health) return { ready: 0, total }
  return {
    ready: health.boxes.filter((box) => box.status === "ready").length,
    total,
  }
}
