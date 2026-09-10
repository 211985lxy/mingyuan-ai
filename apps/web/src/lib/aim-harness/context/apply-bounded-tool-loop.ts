/**
 * 有界工具环并入知识块：生成与对话共用，避免两处各写一遍。
 */

import type { AimTraceRecorder } from "@/lib/aim-observability"
import { runAimTraceStep } from "@/lib/aim-observability"
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import { sanitizeUntrustedContextText } from "@/lib/aim-harness/context-trust"
import {
  collectFeishuKnowledgeSources,
  type FeishuKnowledgeSource,
} from "@/lib/integrations/feishu-knowledge-cite"
import { runBoundedToolLoop } from "@/lib/aim-harness/tool-loop"

export async function applyBoundedToolLoopToKnowledge(input: {
  enabled: boolean
  knowledgeBlock: string
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
  rawInput: string
  userId: string
  projectId?: string
  maxSteps?: number
  timeoutMs?: number
  trace?: AimTraceRecorder
}): Promise<{ knowledgeBlock: string; feishuSources: FeishuKnowledgeSource[] }> {
  if (!input.enabled) {
    return { knowledgeBlock: input.knowledgeBlock, feishuSources: [] }
  }
  const loopResult = await runAimTraceStep(
    input.trace,
    "bounded_tool_loop",
    "有界检索",
    () =>
      runBoundedToolLoop({
        agentId: input.agentId,
        runtimeTask: input.runtimeTask,
        rawInput: input.rawInput,
        userId: input.userId,
        projectId: input.projectId,
        maxSteps: input.maxSteps,
        timeoutMs: input.timeoutMs,
      }),
    (result) => ({
      summary: result.stopReason,
      metadata: {
        steps: result.steps.length,
        stopReason: result.stopReason,
        toolStepCount: result.steps.length,
        toolFailureCount: result.toolFailureCount,
        feishuSourceCount: result.feishuSources.length,
      },
    }),
  )
  const feishuSources = loopResult.feishuSources.length
    ? loopResult.feishuSources
    : collectFeishuKnowledgeSources(loopResult.steps).sources
  if (!loopResult.notes.trim()) {
    return { knowledgeBlock: input.knowledgeBlock, feishuSources }
  }
  const notes = sanitizeUntrustedContextText(loopResult.notes, { label: "bounded_tool_loop" })
  return {
    knowledgeBlock: `【有界检索笔记】\n${notes}\n\n${input.knowledgeBlock}`,
    feishuSources,
  }
}
