import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import type { AimSemanticIntent } from "@/lib/aim/semantic-task-understanding"
import { LOCAL_EDIT_PART_WORDS } from "@/lib/aim-intent-boundaries"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
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
  /** LLM/规则意图仲裁记录（分歧可观测：谁说了什么、谁赢） */
  intentProvenance?: {
    llm: AimSemanticIntent
    ruleTaskKind: ResolvedUserIntent["taskKind"]
    finalTaskKind: ResolvedUserIntent["taskKind"]
    conflicts: string[]
  }
}

/** LLM 覆盖门槛：低于此置信度不覆盖规则判定 */
const LLM_INTENT_ARBITRATION_CONFIDENCE = 0.7

/**
 * 意图仲裁：AI 理解为权威，规则补位。LLM（confidence≥0.7）提供的字段覆盖
 * 规则值；LLM 未提供的字段保留规则值。约束来源统一改记 user_current
 * （经 LLM 从用户指令读出，仍是用户意图而非系统默认）。
 */
function arbitrateIntentWithLlm(
  ruleIntent: ResolvedUserIntent,
  llm: AimSemanticIntent,
): { intent: ResolvedUserIntent; provenance: ExecuteTurnGateResult["intentProvenance"] } {
  const confidence = llm.confidence ?? 0
  const eligible = confidence >= LLM_INTENT_ARBITRATION_CONFIDENCE
  const conflicts: string[] = []
  const intent: ResolvedUserIntent = { ...ruleIntent, constraintSources: { ...ruleIntent.constraintSources } }

  if (eligible && llm.taskKind && llm.taskKind !== ruleIntent.taskKind) {
    conflicts.push(`taskKind: ${ruleIntent.taskKind}→${llm.taskKind}`)
    intent.taskKind = llm.taskKind
  }
  if (eligible && llm.goal && llm.goal !== ruleIntent.goal) {
    conflicts.push(`goal: ${ruleIntent.goal ?? "-"}→${llm.goal}`)
    intent.goal = llm.goal
    intent.constraintSources.goal = "user_current"
  }
  if (eligible && llm.audience && llm.audience !== ruleIntent.audience) {
    conflicts.push("audience: 规则未识别→LLM识别")
    intent.audience = llm.audience
    intent.constraintSources.audience = "user_current"
  }
  if (eligible && llm.topic && !ruleIntent.topic) {
    intent.topic = llm.topic
    intent.constraintSources.topic = "user_current"
  }
  if (eligible && typeof llm.isNewTask === "boolean" && llm.isNewTask !== ruleIntent.isNewTask) {
    conflicts.push(`isNewTask: ${ruleIntent.isNewTask}→${llm.isNewTask}`)
    intent.isNewTask = llm.isNewTask
  }

  return {
    intent,
    provenance: {
      llm,
      ruleTaskKind: ruleIntent.taskKind,
      finalTaskKind: intent.taskKind,
      conflicts,
    },
  }
}

const LOCAL_SCOPE_EXTRA = /第[一二三四五六七八九十\d]+段|某[一段句]|这段|这段话|选区/
const FULL_SCOPE = /整篇|整稿|全文|通篇|终稿/

function isLocalModificationScope(scope?: string): boolean {
  if (!scope) return false
  if (FULL_SCOPE.test(scope)) return false
  if (LOCAL_EDIT_PART_WORDS.some((word) => scope.includes(word))) return true
  return LOCAL_SCOPE_EXTRA.test(scope)
}

export function mapResolvedIntentToRuntimeTask(intent: ResolvedUserIntent): AimRuntimeTask {
  switch (intent.taskKind) {
    case "new_draft":
    case "batch_replicate":
      return "new_copy"
    case "benchmark_rewrite":
    case "imitation_rewrite":
      return "rewrite_copy"
    case "polish_existing":
      return isLocalModificationScope(intent.modificationScope) ? "light_edit" : "rewrite_copy"
    case "opener_optimize":
      return "light_edit"
    case "answer_question":
      throw new Error("answer_question 不得进入 generate")
  }
}

export function resolveExecuteTurnGate(input: {
  envelope: AimContentSourceEnvelope
  handling: "respond" | "deliver" | "clarify"
  llmQuestions?: string[]
  formats?: ContentFormat[]
  /** LLM 结构化意图（协议 v2；快径与理解降级时为空，纯规则仲裁） */
  llmIntent?: AimSemanticIntent
}): ExecuteTurnGateResult {
  const ruleIntent = resolveUserIntentFromEnvelope(input.envelope, input.formats)
  const arbitration = input.llmIntent
    ? arbitrateIntentWithLlm(ruleIntent, input.llmIntent)
    : undefined
  const intent = arbitration?.intent ?? ruleIntent
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
    ...(arbitration?.provenance ? { intentProvenance: arbitration.provenance } : {}),
  }
}
