import type { AimRuntimeTask, ResolvedKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"

/** 内容创作官提示词渐进注入开关。 */
export interface ContentProducerProgressiveFlags {
  includePublishPackage: boolean
  includeHighRisk: boolean
  includeBenchmark: boolean
  /** generate 路径才注入完整运营逻辑；chat 用短句。 */
  includeOperatingLogicFull: boolean
}

const PUBLISH_PACKAGE_PATTERN =
  /发布包|发布文案|发布话题|发布标题|话题标签|配一个发布|整理成发布|写一个发布/

const FORMAL_DELIVERY_TASKS = new Set<AimRuntimeTask>([
  "new_copy",
  "rewrite_copy",
  "positioning_topic",
  "quality_review",
])

/**
 * 按意图 / runtimeTask / 原文推断本轮应挂载的长规则块。
 */
export function resolveContentProducerProgressiveFlags(input: {
  runtimeTask?: AimRuntimeTask
  knowledgeStrategy?: ResolvedKnowledgeStrategy
  rawInput?: string
  contentAction?: string | null
  hasBenchmarkText?: boolean
  /** chat 默认不全量运营逻辑；generate 传 true */
  forGenerate?: boolean
}): ContentProducerProgressiveFlags {
  const text = String(input.rawInput || "")
  const contentAction = String(input.contentAction || "").toLowerCase()
  const includePublishPackage =
    PUBLISH_PACKAGE_PATTERN.test(text)
    || contentAction.includes("publish")
    || contentAction === "publish_package"

  const includeBenchmark =
    Boolean(input.hasBenchmarkText)
    || input.runtimeTask === "rewrite_copy"
    || input.knowledgeStrategy === "rewrite"
    || /对标|仿写|改写|复刻/.test(text)

  // generate：非 light_edit 视为正式交付；chat：仅质检/点名验证才挂高风险长块
  const includeHighRisk = input.forGenerate
    ? Boolean(input.runtimeTask && FORMAL_DELIVERY_TASKS.has(input.runtimeTask))
      || input.runtimeTask == null
    : input.runtimeTask === "quality_review"
      || /验证结果|正式质检|发布前检查|天命全案/.test(text)

  return {
    includePublishPackage,
    includeHighRisk,
    includeBenchmark,
    includeOperatingLogicFull: Boolean(input.forGenerate),
  }
}
