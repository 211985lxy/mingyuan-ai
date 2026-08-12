/**
 * LLM 质检策略 —— 是否对主稿跑 LLM 质检的单一事实源。
 *
 * 历史：是否跑 LLM 质检曾以 `runLlmQuality: false` 硬编码散落在 6 个入口
 * （agent_api 同步/异步、inspiration、meeting、eval、fastSpoken），理由不可见、
 * 改一处漏一处。本模块把"哪些场景跳过、为什么"收敛成一张显式注册表：每个入口
 * 在构造请求时声明自己的场景，决策与理由在此一处维护、可检索、可测试。
 *
 * 行为与历史逐一对应：除主 generate 入口外，其余场景均不跑 LLM 质检
 * （确定性检查照常运行，见 validators.ts / quality.ts）。要给某个场景开启质检，
 * 只改本文件一处即可。
 *
 * 边界：这里只决定"开关层"。quality.ts 内还有第二层规则（free_copywriter /
 * polish_copy / quality_check 不跑、主稿格式必须在 MAIN_DRAFT_FORMATS 内），
 * 与本开关是 AND 关系——两者都满足才会真正调用 LLM 质检。
 */

/** 各生成入口显式声明的 LLM 质检场景。 */
export type AimLlmQualityScenario =
  // agent 创作入口（同步 API + 异步任务）：按产品设计不跑 LLM 质检
  | "agent_api"
  // 灵感生成：临时创意，不做发布前门控
  | "inspiration"
  // 会议洞察提取（business_diagnosis / raw_copy）：非可发布主稿
  | "meeting_insight"
  // 快速口播（单条 video_script/koubo_script）：为压延迟跳过
  | "fast_spoken"
  // 评测/benchmark：永不跑质检
  | "eval"
  // 主 generate 入口：默认跑（列此仅为决策表完整，主入口当前不调用本函数）
  | "main_generate"

export interface AimLlmQualityDecision {
  /** 是否对主稿跑 LLM 质检。写入 AimRunRequest/AimRunSpec.runLlmQuality。 */
  run: boolean
  /** 人类可读的中文理由，便于审计/排查"为什么这次质量是 skipped"。 */
  reason: string
}

const DECISIONS: Record<AimLlmQualityScenario, AimLlmQualityDecision> = {
  agent_api: { run: false, reason: "agent 创作入口按产品设计跳过 LLM 质检" },
  inspiration: { run: false, reason: "灵感生成为临时创意，不做发布前门控" },
  meeting_insight: { run: false, reason: "会议洞察提取非可发布主稿，不跑 LLM 质检" },
  fast_spoken: { run: false, reason: "快速口播模式为降低首字延迟跳过 LLM 质检" },
  eval: { run: false, reason: "评测/benchmark 环境不跑 LLM 质检" },
  main_generate: { run: true, reason: "主 generate 入口默认跑 LLM 质检" },
}

/**
 * 按 scenario 返回 LLM 质检决策（run + reason）。纯函数，无副作用。
 */
export function resolveLlmQuality(scenario: AimLlmQualityScenario): AimLlmQualityDecision {
  return DECISIONS[scenario]
}
