/**
 * AIM execute 入口的意图理解与门禁装配（从 route 抽出以守 250 行域边界）。
 *
 * resolveUnderstandingWithDegradation：LLM 语义理解失败不整轮 500，按规则意图继续并打降级标记。
 * resolveAndTraceTurnGate：规则/LLM 仲裁后的意图约束解析 + 指令/素材可观测 + 挂载规则块 trace。
 * 纯搬运，行为与抽离前逐字一致。
 */

import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import type { ContentFormat } from "@/lib/api/client"
import { addAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"
import { countAimMaterialChars, extractAimInstructionText } from "@/lib/aim-current-user-input"
import { resolveExecuteTurnGate } from "@/lib/aim/execute-turn-intent-gate"
import { MOUNTED_RULE_BLOCK_LABELS } from "@/lib/aim/mounted-rule-blocks"
import { understandAimContentTurnWithTrace } from "@/lib/aim/semantic-task-understanding"

export async function resolveAndTraceTurnGate(input: {
  scopedParsed: { sourceEnvelope: AimContentSourceEnvelope; targetFormats: ContentFormat[] }
  understanding: Awaited<ReturnType<typeof understandAimContentTurnWithTrace>>
  trace?: AimTraceRecorder
}) {
  const { scopedParsed, understanding, trace } = input
  const gate = resolveExecuteTurnGate({
    envelope: scopedParsed.sourceEnvelope,
    handling: understanding.handling,
    llmQuestions: understanding.clarificationQuestions,
    formats: scopedParsed.targetFormats,
    llmIntent: understanding.intent,
  })
  const mountedSummary = gate.mountedRuleBlocks.length
    ? `｜挂载 ${gate.mountedRuleBlocks.map((id) => MOUNTED_RULE_BLOCK_LABELS[id]).join("、")}`
    : ""
  await addAimTraceStep(trace, {
    key: "resolve_user_intent",
    label: "意图约束解析",
    status: "success",
    summary: `${gate.intent.taskKind}｜${gate.intent.isNewTask ? "新任务" : "延续任务"}｜缺口 ${gate.deterministicGaps.length} 项${mountedSummary}`,
    metadata: {
      taskKind: gate.intent.taskKind,
      isNewTask: gate.intent.isNewTask,
      lengthPolicy: gate.intent.lengthPolicy,
      constraintSources: gate.intent.constraintSources,
      gaps: gate.deterministicGaps.map((gap) => gap.field),
      mountedRuleBlocks: gate.mountedRuleBlocks,
      understandingDegraded: understanding.degraded ?? false,
      // 指令/素材分离可观测：本轮指令多长、素材多大
      instructionChars: extractAimInstructionText(scopedParsed.sourceEnvelope.currentUserRequest).length,
      materialChars: countAimMaterialChars(scopedParsed.sourceEnvelope.currentUserRequest),
      // LLM/规则分歧可观测：LLM 说了什么、规则说了什么、最终谁赢
      intentArbitration: gate.intentProvenance
        ? {
            ruleTaskKind: gate.intentProvenance.ruleTaskKind,
            finalTaskKind: gate.intentProvenance.finalTaskKind,
            conflicts: gate.intentProvenance.conflicts,
            llmConfidence: gate.intentProvenance.llm.confidence ?? null,
          }
        : null,
    },
  })
  return gate
}

/**
 * 语义理解（带降级）：LLM 理解失败不整轮 500，按规则意图继续并打降级标记。
 */
export async function resolveUnderstandingWithDegradation(input: {
  envelope: Parameters<typeof understandAimContentTurnWithTrace>[0]["envelope"]
  agentId: string
  trace?: AimTraceRecorder
}) {
  try {
    return await understandAimContentTurnWithTrace(input)
  } catch (understandingError) {
    await addAimTraceStep(input.trace, {
      key: "semantic_understanding_degraded",
      label: "语义理解降级",
      status: "failed",
      summary: "LLM 理解失败，本轮按规则意图继续",
      metadata: {
        reason: understandingError instanceof Error ? understandingError.message.slice(0, 200) : String(understandingError),
      },
    })
    return {
      handling: "deliver" as const,
      brief: input.envelope.currentUserRequest.slice(0, 200),
      degraded: true as const,
    }
  }
}
