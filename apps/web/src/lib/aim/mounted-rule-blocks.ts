/**
 * 渐进规则块挂载——单一来源（隐性触发显性化第一步）。
 *
 * 此前"哪些长规则块会被挂载"由散落的正则悄悄决定（发布包/对标防抄袭/
 * 交付验证/爆款工具箱），用户和开发者都看不见。现在：
 * 1. 触发模式集中在本模块（唯一来源），progressive-prompt-flags 只做委托；
 * 2. 统一入口把挂载结果写进执行轨迹（resolve_user_intent 步），
 *    用户在思考过程里能看到"本轮挂载了哪些规则"。
 * 后续第二步（待办）：由语义理解判定挂载意图，替代关键词匹配。
 */

export type MountedRuleBlockId =
  | "publish_package"
  | "benchmark_guardrail"
  | "high_risk_loop"
  | "viral_toolkit"

export const MOUNTED_RULE_BLOCK_LABELS: Record<MountedRuleBlockId, string> = {
  publish_package: "发布包规则",
  benchmark_guardrail: "对标防抄袭",
  high_risk_loop: "交付验证规则",
  viral_toolkit: "爆款工具箱",
}

export const PUBLISH_PACKAGE_TRIGGER_PATTERN =
  /发布包|发布文案|发布话题|发布标题|话题标签|配一个发布|整理成发布|写一个发布/

export const VIRAL_TOOLKIT_TRIGGER_PATTERN =
  /优化开头|开头优化|爆款开头|开头库|结构库|结尾库|钩子优化|优化钩子|前3秒|前三秒|开头公式|节奏打磨|打磨节奏|爆款结构|文案结构|爆款拆解|拆解爆款/

export const BENCHMARK_TRIGGER_PATTERN = /对标|仿写|改写|复刻/

export const HIGH_RISK_CHAT_TRIGGER_PATTERN = /验证结果|正式质检|发布前检查|天命全案/

/** 正式交付类任务（generate 侧挂交付验证规则的条件） */
export const FORMAL_DELIVERY_TASKS: ReadonlySet<string> = new Set([
  "new_copy",
  "rewrite_copy",
  "positioning_topic",
  "quality_review",
])

export function resolveMountedRuleBlocks(input: {
  request: string
  runtimeTask?: string
  knowledgeStrategy?: string
  hasBenchmarkText?: boolean
  /** generate：非轻改视为正式交付；chat：仅质检/点名验证才挂 */
  forGenerate?: boolean
  contentAction?: string | null
}): MountedRuleBlockId[] {
  const text = input.request
  const blocks: MountedRuleBlockId[] = []

  const contentAction = String(input.contentAction || "").toLowerCase()
  if (
    PUBLISH_PACKAGE_TRIGGER_PATTERN.test(text)
    || contentAction.includes("publish")
    || contentAction === "publish_package"
  ) {
    blocks.push("publish_package")
  }

  // 互斥硬约束：light_edit 语义是「保留原文、只改局部」，与「整篇至少 30% 重写」
  // 「交付验证区块」互斥；绝不能同时注入，否则模型收到相反指令。
  if (input.runtimeTask === "light_edit") {
    if (VIRAL_TOOLKIT_TRIGGER_PATTERN.test(text)) blocks.push("viral_toolkit")
    return blocks
  }

  if (
    Boolean(input.hasBenchmarkText)
    || input.runtimeTask === "rewrite_copy"
    || input.knowledgeStrategy === "rewrite"
    || BENCHMARK_TRIGGER_PATTERN.test(text)
  ) {
    blocks.push("benchmark_guardrail")
  }

  const highRisk = input.forGenerate
    ? Boolean(input.runtimeTask && FORMAL_DELIVERY_TASKS.has(input.runtimeTask))
      || input.runtimeTask == null
    : input.runtimeTask === "quality_review"
      || HIGH_RISK_CHAT_TRIGGER_PATTERN.test(text)
  if (highRisk) blocks.push("high_risk_loop")

  if (
    VIRAL_TOOLKIT_TRIGGER_PATTERN.test(text)
    || input.runtimeTask === "rewrite_copy"
    || input.runtimeTask === "quality_review"
    || input.knowledgeStrategy === "rewrite"
  ) {
    blocks.push("viral_toolkit")
  }

  return blocks
}
