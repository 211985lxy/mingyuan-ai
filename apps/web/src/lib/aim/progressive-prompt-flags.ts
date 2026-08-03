import type { AimRuntimeTask, ResolvedKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"

/** 内容创作官提示词渐进注入开关。 */
export interface ContentProducerProgressiveFlags {
  includePublishPackage: boolean
  includeHighRisk: boolean
  includeBenchmark: boolean
  /** generate 路径才注入完整运营逻辑；chat 用短句。 */
  includeOperatingLogicFull: boolean
  /** 专家技能包（爆款开头库/19条法则/5A框架等）；仅意图命中时注入，避免每次全量灌。 */
  includeViralToolkit: boolean
}

const PUBLISH_PACKAGE_PATTERN =
  /发布包|发布文案|发布话题|发布标题|话题标签|配一个发布|整理成发布|写一个发布/

/** 命中「调用专家技能」意图才注入爆款开头库/结构库等深度方法论。 */
const VIRAL_TOOLKIT_PATTERN =
  /优化开头|开头优化|爆款开头|开头库|结构库|结尾库|钩子优化|优化钩子|前3秒|前三秒|开头公式|节奏打磨|打磨节奏|爆款结构|文案结构|爆款拆解|拆解爆款/

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

  // 互斥硬约束：light_edit 的语义是「保留原文、只改局部」，与「整篇至少 30% 重写」
  // 「正式交付验证区块」是互斥指令。无论原文是否含「对标/改写」字样，light_edit
  // 都绝不能注入这两条长规则块，否则模型会同时收到「保留原文」与「整篇重写」
  // 两个相反要求（历史踩过的坑，见契约测试 aim-prompt-contract.test.ts）。
  if (input.runtimeTask === "light_edit") {
    return {
      includePublishPackage,
      includeHighRisk: false,
      includeBenchmark: false,
      includeOperatingLogicFull: Boolean(input.forGenerate),
      // light_edit 也可能点名优化开头，按意图放行
      includeViralToolkit: VIRAL_TOOLKIT_PATTERN.test(text),
    }
  }

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

  // 专家技能包：意图命中（优化开头/爆款/节奏/结构等）或对标改写/质检时才注入。
  // 普通写文案不灌全量方法论，避免 token 过载导致产出短/变形。
  const includeViralToolkit =
    VIRAL_TOOLKIT_PATTERN.test(text)
    || input.runtimeTask === "rewrite_copy"
    || input.runtimeTask === "quality_review"
    || input.knowledgeStrategy === "rewrite"

  return {
    includePublishPackage,
    includeHighRisk,
    includeBenchmark,
    includeOperatingLogicFull: Boolean(input.forGenerate),
    includeViralToolkit,
  }
}
