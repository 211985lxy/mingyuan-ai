import type { ParseGenerateBodyResult } from "@/lib/aim-generate-validate"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { prepareAimGenerateInput } from "@/lib/aim-harness/request-context"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { runAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"
import { buildWorkflowBrief } from "@/lib/aim-workflow-brief"

interface AimGenerationServiceInput {
  userId: string
  parsed: ParseGenerateBodyResult
  trace: AimTraceRecorder | undefined
}

/**
 * @description prepareaimgenerationcontext
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function prepareAimGenerationContext({
  userId,
  parsed,
  trace,
}: AimGenerationServiceInput) {
  // Browser-supplied workflow facts are rebuilt and re-authorized server-side.
  const workflowBrief = parsed.workflow
    ? await buildWorkflowBrief({
        userId,
        ...parsed.workflow,
        projectId: parsed.workflow.projectId || parsed.projectId || undefined,
      })
    : undefined

  const preparedInput = await prepareAimGenerateInput({
    userId,
    agentId: parsed.agentId,
    rawInput: parsed.rawInput,
    targetFormats: parsed.targetFormats,
    taskType: parsed.taskType,
    polishInstruction: parsed.polishInstruction,
    videoCopyExtractionId: parsed.videoCopyExtractionId,
    useMarketViralVideos: parsed.useMarketViralVideos,
    trace,
  })

  return {
    rawInput: preparedInput.rawInput,
    runtimeTask: preparedInput.runtimeTask,
    projectId: workflowBrief?.projectId || parsed.projectId,
    taskSpec: workflowBrief?.taskSpec,
  }
}

interface ExecuteAimGenerationInput extends AimGenerationServiceInput {
  context: Awaited<ReturnType<typeof prepareAimGenerationContext>>
}

/**
 * @description 执行preparedaimgeneration
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function executePreparedAimGeneration({
  userId,
  parsed,
  trace,
  context,
}: ExecuteAimGenerationInput) {
  return executeAimRun({
    entrypoint: "generate",
    rawInput: context.rawInput,
    agentId: parsed.agentId || "content_producer",
    targetFormats: parsed.targetFormats,
    taskType: parsed.taskType,
    polishInstruction: parsed.polishInstruction,
    topicTitle: parsed.topicTitle,
    topicRationale: parsed.topicRationale,
    topicType: parsed.topicType,
    hotTopic: parsed.hotTopic,
    videoCopyExtractionId: parsed.videoCopyExtractionId,
    existingGenerationId: parsed.existingGenerationId,
    topicSelectionId: parsed.topicSelectionId,
    selectedTopicIndex: parsed.selectedTopicIndex,
    runtimeTask: context.runtimeTask,
    taskSpec: context.taskSpec,
    actorId: userId,
    projectId: context.projectId,
    trace,
  }, (spec) => executeAimGenerationDomain(spec, {
    userId,
    projectId: context.projectId,
    rawInput: context.rawInput,
    targetFormats: parsed.targetFormats,
    taskType: parsed.taskType,
    topicTitle: parsed.topicTitle,
    topicRationale: parsed.topicRationale,
    topicType: parsed.topicType,
    hotTopic: parsed.hotTopic,
    polishInstruction: parsed.polishInstruction,
    videoCopyExtractionId: parsed.videoCopyExtractionId,
    existingGenerationId: parsed.existingGenerationId,
    topicSelectionId: parsed.topicSelectionId,
    selectedTopicIndex: parsed.selectedTopicIndex,
    trace,
    taskSpec: context.taskSpec,
    contentTaskCard: parsed.contentTaskCard,
  }))
}

type AimGenerationRun = Awaited<ReturnType<typeof executePreparedAimGeneration>>

/**
 * @description recordaimgenerationquality
 * @param trace - 追踪
 * @param run - run
 * @returns 无返回值
 */
export async function recordAimGenerationQuality(
  trace: AimTraceRecorder | undefined,
  run: AimGenerationRun,
) {
  if (!run.qualityReport) return

  await runAimTraceStep(
    trace,
    "quality_gate",
    "生成后质检（含违禁词检测）",
    async () => run.qualityReport as Record<string, unknown>,
    (report) => ({
      summary: `质检得分 ${(report as { overallScore?: number }).overallScore ?? "-"}/10，${(report as { passed?: boolean }).passed ? "通过" : "未通过"}`,
      metadata: {
        ...report,
        runId: run.metadata.runId,
        degraded: run.metadata.degraded,
        provider: run.metadata.provider,
        model: run.metadata.model,
        qualityStatus: run.qualityStatus,
      },
    }),
  )
}
