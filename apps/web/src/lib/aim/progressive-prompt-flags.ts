import type { AimRuntimeTask, ResolvedKnowledgeStrategy } from "@/lib/aim-knowledge-strategy"
import { resolveMountedRuleBlocks } from "@/lib/aim/mounted-rule-blocks"

/** 内容创作官提示词渐进注入开关。触发模式唯一来源见 mounted-rule-blocks.ts。 */
export interface ContentProducerProgressiveFlags {
  includePublishPackage: boolean
  includeHighRisk: boolean
  includeBenchmark: boolean
  /** generate 路径才注入完整运营逻辑；chat 用短句。 */
  includeOperatingLogicFull: boolean
  /** 专家技能包（爆款开头库/19条法则/5A框架等）；仅意图命中时注入，避免每次全量灌。 */
  includeViralToolkit: boolean
}

/**
 * 按意图 / runtimeTask / 原文推断本轮应挂载的长规则块。
 * 判定逻辑全部委托 resolveMountedRuleBlocks（单一来源，执行轨迹同步可见）。
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
  const blocks = new Set(resolveMountedRuleBlocks({
    request: String(input.rawInput || ""),
    runtimeTask: input.runtimeTask,
    knowledgeStrategy: input.knowledgeStrategy,
    hasBenchmarkText: input.hasBenchmarkText,
    forGenerate: input.forGenerate,
    contentAction: input.contentAction,
  }))

  return {
    includePublishPackage: blocks.has("publish_package"),
    includeHighRisk: blocks.has("high_risk_loop"),
    includeBenchmark: blocks.has("benchmark_guardrail"),
    includeOperatingLogicFull: Boolean(input.forGenerate),
    includeViralToolkit: blocks.has("viral_toolkit"),
  }
}
