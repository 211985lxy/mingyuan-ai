import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import {
  buildNumberedClarification,
  collectIntentClarificationGaps,
  isClarificationAnswerTurn,
  mergeClarificationQuestions,
  resolveUserIntentFromEnvelope,
  type IntentClarificationGap,
  type ResolvedUserIntent,
} from "@/lib/aim/resolved-user-intent"
import { resolveMountedRuleBlocks, type MountedRuleBlockId } from "@/lib/aim/mounted-rule-blocks"
import type { ContentFormat } from "@/lib/api/client"

/**
 * 统一入口的"意图门"：意图解析 + 关键缺口 + 规则块挂载 + 追问组装。
 * 从 execute 路由抽出（保持路由处理函数 ≤80 行），纯函数可单测。
 */

export interface ExecuteTurnGateResult {
  intent: ResolvedUserIntent
  deterministicGaps: IntentClarificationGap[]
  mountedRuleBlocks: MountedRuleBlockId[]
  /** 关键缺口未确认时的合并追问；可生成/可直接回复时为 null */
  clarification: { question: string; questions: string[] } | null
}

export function resolveExecuteTurnGate(input: {
  envelope: AimContentSourceEnvelope
  handling: "respond" | "deliver" | "clarify"
  llmQuestions?: string[]
  formats?: ContentFormat[]
}): ExecuteTurnGateResult {
  const intent = resolveUserIntentFromEnvelope(input.envelope, input.formats)
  // 用户正在回答上一轮追问时不再追加确定性追问，避免重复问已确认字段
  const deterministicGaps = isClarificationAnswerTurn(input.envelope)
    ? []
    : collectIntentClarificationGaps(intent)
  const mountedRuleBlocks = resolveMountedRuleBlocks({
    request: input.envelope.currentUserRequest,
  })

  let gapsToAsk: IntentClarificationGap[] = []
  if (input.handling === "clarify") {
    gapsToAsk = mergeClarificationQuestions(input.llmQuestions ?? [], deterministicGaps)
  } else if (input.handling === "deliver" && deterministicGaps.length > 0) {
    // 用户指令唯一真源：关键缺口未确认不先生成，也不用隐藏默认值顶替
    gapsToAsk = deterministicGaps
  }
  const clarificationText = gapsToAsk.length ? buildNumberedClarification(gapsToAsk) : undefined

  return {
    intent,
    deterministicGaps,
    mountedRuleBlocks,
    clarification: clarificationText
      ? { question: clarificationText, questions: gapsToAsk.map((gap) => gap.question) }
      : null,
  }
}
