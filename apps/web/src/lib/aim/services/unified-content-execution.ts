import type { AimExecuteBody } from "@/features/aim/contracts/api"
import { prepareAimGenerateRequest, executePreparedAimGeneration } from "@/lib/aim/services/generate-request"
import type { AimSemanticTaskUnderstanding } from "@/lib/aim/semantic-task-understanding"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import { executeGenerateLLM } from "@/lib/aim-agent-model"
import { inspectAimDeliveryCandidate, parseStrictMultiFormatResponse } from "@/lib/aim/output-delivery-gate"
import { AimSemanticDeliveryError, buildAimSemanticRevisionPrompt, runAimSemanticRevisionLoop, verifyAimDelivery, type AimSemanticDeliveryVerdict } from "@/lib/aim/semantic-delivery-verifier"

interface UnifiedReplyPorts {
  complete: (systemPrompt: string, userPrompt: string) => Promise<{ content: string; finishReason?: string | null }>
  verify: (candidate: string) => Promise<AimSemanticDeliveryVerdict>
}

export async function executeVerifiedUnifiedReply(input: {
  userId: string
  parsed: AimExecuteBody
  understanding: AimSemanticTaskUnderstanding
  trace?: AimTraceRecorder
  ports?: UnifiedReplyPorts
}): Promise<string> {
  const agentId = input.parsed.executionAgentId || input.parsed.agentId || "content_producer"
  const systemPrompt = [
    "你是企业营销内容专家，只回答用户当前问题，不另写用户没有要求的新稿。",
    "当前用户原话是唯一最高真源，历史、当前作品和参考材料不得覆盖它。",
    "不输出任务复述、工作计划、内部讨论或思维过程。",
    "用 ===FORMAT:raw_copy=== 标记最终回答。",
  ].join("\n")
  const originalPrompt = [
    `【当前用户原话】\n${input.parsed.sourceEnvelope.currentUserRequest}`,
    `【临时任务理解】\n${input.understanding.brief}`,
    input.parsed.sourceEnvelope.currentArtifact
      ? `【当前作品】\n${input.parsed.sourceEnvelope.currentArtifact.content}`
      : "",
  ].filter(Boolean).join("\n\n")
  const complete = input.ports?.complete ?? ((nextSystem, nextUser) => executeGenerateLLM(agentId, nextSystem, nextUser))
  const verify = input.ports?.verify ?? ((candidate) => verifyAimDelivery({
    envelope: input.parsed.sourceEnvelope,
    candidate,
    agentId,
  }))

  return runAimSemanticRevisionLoop({
    maxRevisions: 2,
    execute: async (gaps) => {
      const prompt = gaps.length ? buildAimSemanticRevisionPrompt({ originalPrompt, gaps }) : originalPrompt
      const completion = await complete(systemPrompt, prompt)
      const parsed = parseStrictMultiFormatResponse(completion.content, ["raw_copy"])
      if (!parsed.ok) throw new AimSemanticDeliveryError()
      const gate = inspectAimDeliveryCandidate({ contents: parsed.contents, finishReason: completion.finishReason })
      if (!gate.passed) throw new AimSemanticDeliveryError()
      return parsed.contents.raw_copy || ""
    },
    verify,
  })
}

export async function executeVerifiedUnifiedDelivery(input: {
  userId: string
  parsed: AimExecuteBody
  understanding: AimSemanticTaskUnderstanding
  trace?: AimTraceRecorder
}) {
  const unifiedContentExecution = {
    envelope: input.parsed.sourceEnvelope,
    brief: input.understanding.brief,
  }
  const prepared = await prepareAimGenerateRequest(input.userId, {
    agentId: input.parsed.executionAgentId || input.parsed.agentId || "content_producer",
    projectId: input.parsed.projectId,
    rawInput: input.parsed.sourceEnvelope.currentUserRequest,
    sourceEnvelope: input.parsed.sourceEnvelope,
    targetFormats: input.parsed.targetFormats,
    methodologyProfileIds: input.parsed.methodologyProfileIds,
    activeMethodologySignals: input.parsed.activeMethodologySignals,
  }, {
    trace: input.trace,
    unifiedContentExecution,
  })
  if (!prepared.ok) throw new Error(prepared.validationError)
  return executePreparedAimGeneration(prepared)
}
