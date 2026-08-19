import type { CompletionResult } from "@/lib/llm/types"
import type { AimGenerateContext } from "@/lib/aim/agent-types"
import type { ContentFormat } from "@/lib/aim-generator"
import { inspectAimDeliveryCandidate, parseStrictMultiFormatResponse } from "@/lib/aim/output-delivery-gate"
import { verifyAimDelivery } from "@/lib/aim/semantic-delivery-verifier"
import { isAimFastSpokenRoute } from "@/lib/aim-harness/fast-spoken-policy"

export function shouldApplyLegacyLightEditRules(
  context: Pick<AimGenerateContext, "runtimeTask" | "unifiedContentExecution">,
): boolean {
  return !context.unifiedContentExecution && context.runtimeTask === "light_edit"
}

export function inspectUnifiedGenerationProtocol(
  completion: Pick<CompletionResult, "content" | "finishReason">,
  targetFormats: ContentFormat[],
): { passed: true } | { passed: false; code: string } {
  const parsed = parseStrictMultiFormatResponse(completion.content, targetFormats)
  if (!parsed.ok) return { passed: false, code: parsed.code }
  return inspectAimDeliveryCandidate({ contents: parsed.contents, finishReason: completion.finishReason })
}

export async function verifyUnifiedGenerationCandidate(input: {
  context: AimGenerateContext
  parsed: Partial<Record<ContentFormat, string>>
  targetFormats: ContentFormat[]
  agentId: string
}) {
  if (!input.context.unifiedContentExecution) return { passed: true as const }
  // 快速口播已有格式/长度/安全闸门；再跑一轮 LLM 语义验收会把 90s 预算叠到 3 分钟以上。
  if (isAimFastSpokenRoute(input.context.modelPolicy?.routeKey)) return { passed: true as const }
  const candidate = input.targetFormats
    .map((format) => `===FORMAT:${format}===\n${input.parsed[format] || ""}`)
    .join("\n\n")
  return verifyAimDelivery({
    envelope: input.context.unifiedContentExecution.envelope,
    candidate,
    agentId: input.agentId,
    modelPolicy: input.context.modelPolicy,
  })
}
