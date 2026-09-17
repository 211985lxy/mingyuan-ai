import type { ContentFormat } from "@/lib/aim-generator"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import { AIM_EXECUTION_DEADLINE_MS } from "@/lib/llm/execution-deadline"
import type { AimAgentId, AimEntrypoint } from "./contracts"

export const AIM_FAST_SPOKEN_ROUTE_KEY = "content_producer.fast_spoken"
export const AIM_FAST_SPOKEN_MAX_TOKENS = 2_500
export const AIM_FAST_SPOKEN_MAX_GENERATION_ATTEMPTS = 2
/**
 * 快口播单跳超时上限。
 *
 * 这个值此前导出后全仓无人引用，是条死常量，看起来像"已经给快口播设了 45s 单跳上限"，
 * 实际快口播和慢路径吃的是同一张路由表。现在由 agent-router-budget.test.ts 断言
 * QUALITY_PRIMARY_ROUTE 各跳都不超过它——常量不再是摆设，而是被测试守住的契约。
 * 若将来给快口播单独建路由表，这张表同样受此上限约束。
 */
export const AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS = 45_000
export const AIM_FAST_SPOKEN_TOTAL_BUDGET_MS = AIM_EXECUTION_DEADLINE_MS

const FAST_SPOKEN_FORMATS = new Set<ContentFormat>(["video_script", "koubo_script"])

export function isAimFastSpokenRun(input: {
  agentId: AimAgentId
  entrypoint: AimEntrypoint
  runtimeTask: AimRuntimeTask
  targetFormats: ContentFormat[]
}): boolean {
  return input.entrypoint === "generate"
    && input.agentId === "content_producer"
    && input.runtimeTask === "new_copy"
    && input.targetFormats.length === 1
    && FAST_SPOKEN_FORMATS.has(input.targetFormats[0])
}

export function isAimFastSpokenRoute(routeKey: string | undefined): boolean {
  return routeKey === AIM_FAST_SPOKEN_ROUTE_KEY
}
