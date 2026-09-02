import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { prepareAimGenerateInput } from "@/lib/aim-harness/request-context"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { isAimFastSpokenRoute } from "@/lib/aim-harness/fast-spoken-policy"
import {
  addAimTraceStep,
  createAimTrace,
  failAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { buildWorkflowBrief } from "@/lib/aim-workflow-brief"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import { ownsActiveProject } from "@/lib/resource-ownership"
import { prisma } from "@/lib/prisma"

/**
 * @description prepareaimgeneraterequest
 * @param userId - 用户 ID
 * @param body - 请求体
 * @returns 无返回值
 */
export async function prepareAimGenerateRequest(
  userId: string,
  body: Record<string, unknown>,
  internal?: {
    trace?: AimTraceRecorder
    unifiedContentExecution?: import("@/lib/aim-harness/contracts").AimRunRequest["unifiedContentExecution"]
  },
) {
  const parsed = parseGenerateBody(body)
  const trace = internal?.trace ?? await createAimTrace({
    id: typeof body.traceId === "string" ? (body.traceId as string).trim() || undefined : undefined,
    userId,
    projectId: parsed.projectId || null,
    agentId: parsed.agentId || null,
    action: "generate",
    inputSummary: parsed.rawInput,
  })
  await addAimTraceStep(trace, {
    key: "parse_request",
    label: "请求解析",
    status: "success",
    summary: "生成请求已解析",
    inputSummary: summarizeText(body),
    metadata: { agentId: parsed.agentId, targetFormats: parsed.targetFormats },
  })
  const validationError = await runAimTraceStep(
    trace,
    "validate_input",
    "输入校验",
    () => validateGenerateInput(parsed),
    (error) => ({ summary: error ? "校验失败" : "校验通过", error: error || undefined }),
  )
  if (validationError) {
    await failAimTrace(trace, validationError)
    return { ok: false as const, trace, validationError, status: 400 as const }
  }
  if (parsed.projectId && !await ownsActiveProject(userId, parsed.projectId)) {
    const projectError = "项目不存在或已归档"
    await failAimTrace(trace, projectError)
    return { ok: false as const, trace, validationError: projectError, status: 404 as const }
  }
  const workflowBrief = parsed.workflow
    ? await buildWorkflowBrief({ userId, ...parsed.workflow, projectId: parsed.workflow.projectId || parsed.projectId || undefined })
    : undefined
  const preparedInput = internal?.unifiedContentExecution
    ? {
        rawInput: parsed.rawInput,
        // 仅用于兼容尚未移除的 Harness 类型；统一入口的语义和执行边界
        // 只读取 unifiedContentExecution，不再从用户原话映射旧动作分类。
        runtimeTask: "new_copy" as const,
      }
    : await prepareAimGenerateInput({
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
  const runtimeTask = preparedInput.runtimeTask
  if (parsed.confirmedTurnIntent) {
    await addAimTraceStep(trace, {
      key: "legacy_intent_observed",
      label: "旧意图字段观测",
      status: "success",
      summary: "已忽略旧意图字段的执行控制权",
      metadata: {
        action: parsed.confirmedTurnIntent.action,
        scope: parsed.confirmedTurnIntent.scope,
      },
    })
  }
  return {
    ok: true as const,
    userId,
    parsed,
    trace,
    workflowBrief,
    rawInput: preparedInput.rawInput,
    runtimeTask,
    unifiedContentExecution: internal?.unifiedContentExecution,
  }
}

type PreparedRequest = Extract<Awaited<ReturnType<typeof prepareAimGenerateRequest>>, { ok: true }>
type UnifiedPreparedRequest = PreparedRequest & {
  unifiedContentExecution?: import("@/lib/aim-harness/contracts").AimRunRequest["unifiedContentExecution"]
}

/**
 * @description 执行preparedaimgeneration
 * @param prepared - prepared
 * @returns 无返回值
 */
export async function executePreparedAimGeneration(prepared: UnifiedPreparedRequest) {
  const { parsed, trace, userId, workflowBrief, runtimeTask } = prepared
  const projectId = workflowBrief?.projectId || parsed.projectId

  // 派生到已有母稿时，复用其已确认母内容 / 内容包状态
  let taskSpec = workflowBrief?.taskSpec
  if (parsed.existingGenerationId && !taskSpec) {
    const existing = await prisma.aimGeneration.findFirst({
      where: { id: parsed.existingGenerationId, userId },
      select: { taskSpec: true },
    })
    if (existing?.taskSpec && typeof existing.taskSpec === "object" && !Array.isArray(existing.taskSpec)) {
      taskSpec = existing.taskSpec as unknown as import("@/lib/task-spec").TaskSpec
    }
  }

  // 编辑室：从 taskSpec.materialAnchors 注入样本锚点块
  const { getMaterialAnchorsFromTaskSpec } = await import("@/features/newsroom/services/build-source-brief")
  const { buildRawInputWithOpportunityBrief } = await import("@/lib/aim-generate-context")
  const anchors = getMaterialAnchorsFromTaskSpec(taskSpec)
  const rawInputWithAnchors = buildRawInputWithOpportunityBrief(prepared.rawInput, anchors)
  // 旧入口补渲染来源信封：统一入口之外的 agent 也把参考材料/当前作品/最近对话
  // 带给模型，不再静默丢弃（修复"界面看着有素材、模型看不见"）
  const rawInput = prepared.unifiedContentExecution
    ? rawInputWithAnchors
    : appendEnvelopeContext(rawInputWithAnchors, parsed.sourceEnvelope)

  return executeAimRun({
    entrypoint: "generate",
    rawInput,
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
    runtimeTask,
    agentModule: parsed.agentModule,
    writerModule: parsed.writerModule,
    taskSpec,
    actorId: userId,
    projectId,
    methodologyProfileIds: parsed.methodologyProfileIds,
    unifiedContentExecution: prepared.unifiedContentExecution,
    trace,
  }, (spec) => executeAimGenerationDomain(spec, {
    userId,
    projectId,
    rawInput,
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
    methodologyProfileIds: parsed.methodologyProfileIds,
    trace,
    taskSpec,
    confirmedTurnIntent: parsed.confirmedTurnIntent,
    reviewMode: parsed.reviewMode,
    useStyleProfileOverride: parsed.useStyleProfileOverride,
    activeMethodologySignals: parsed.activeMethodologySignals,
    unifiedContentExecution: prepared.unifiedContentExecution,
  }))
}


/** 旧入口的信封渲染：参考材料/当前作品/最近对话拼接进 rawInput（带各自的字符上限） */
function appendEnvelopeContext(rawInput: string, envelope?: AimContentSourceEnvelope): string {
  if (!envelope) return rawInput
  const parts: string[] = []
  for (const item of envelope.referenceMaterials ?? []) {
    if (!item.content.trim()) continue
    parts.push(`【参考材料：${item.title}】\n${item.content.slice(0, 12_000)}`)
  }
  const artifact = envelope.currentArtifact?.content?.trim()
  if (artifact) parts.push(`【当前作品】\n${artifact.slice(0, 12_000)}`)
  const recent = (envelope.relevantConversation ?? []).slice(-6)
    .filter((turn) => turn.content.trim())
  if (recent.length) {
    parts.push(`【最近对话】\n${recent
      .map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content.slice(0, 600)}`)
      .join("\n")}`)
  }
  if (!parts.length) return rawInput
  return `${rawInput}\n\n${parts.join("\n\n")}`
}

/**
 * @description recordaimgenerationquality
 * @param trace - 追踪
 * @param run - run
 * @returns 无返回值
 */
export async function recordAimGenerationQuality(trace: AimTraceRecorder | undefined, run: {
  qualityReport?: Record<string, unknown>
  qualityStatus?: "pass" | "warn" | "fail" | "skipped"
  metadata: { runId: string; degraded: boolean; provider?: string; model?: string }
}) {
  if (!run.qualityReport) return
  await runAimTraceStep(
    trace,
    "quality_gate",
    "生成后质检（含违禁词检测）",
    async () => run.qualityReport as Record<string, unknown>,
    (report) => ({
      summary: `质检得分 ${(report as { overallScore?: number }).overallScore ?? "-"}/10，${(report as { passed?: boolean }).passed ? "通过" : "未通过"}`,
      metadata: { ...report, ...run.metadata, qualityStatus: run.qualityStatus },
    }),
  )
}

/**
 * @description serializeaimgenerationrun
 * @param run - run
 * @returns 无返回值
 */
export function serializeAimGenerationRun(run: Awaited<ReturnType<typeof executePreparedAimGeneration>>) {
  return {
    ...run.output,
    runId: run.metadata.runId,
    degraded: run.metadata.degraded,
    provider: run.metadata.provider,
    model: run.metadata.model,
    fastPath: isAimFastSpokenRoute(run.spec?.modelPolicy?.routeKey),
    qualityStatus: run.qualityStatus,
    qualityChecks: run.qualityChecks,
    qualityReport: run.qualityReport,
  }
}
