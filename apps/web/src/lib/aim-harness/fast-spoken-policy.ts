import type { ContentFormat } from "@/lib/aim-generator"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import type { AimAgentId, AimEntrypoint } from "./contracts"

export const AIM_FAST_SPOKEN_ROUTE_KEY = "content_producer.fast_spoken"
export const AIM_FAST_SPOKEN_MAX_TOKENS = 2_500
export const AIM_FAST_SPOKEN_PROVIDER_TIMEOUT_MS = 22_000
export const AIM_FAST_SPOKEN_TOTAL_BUDGET_MS = 28_000

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
