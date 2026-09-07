import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { prepareAimGenerateInput } from "@/lib/aim-harness/request-context"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { isAimFastSpokenRoute } from "@/lib/aim-harness/fast-spoken-policy"
import {
  addAimTraceStep,
  createAimTrace,
  logAimProjectContextRejection,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { buildWorkflowBrief } from "@/lib/aim-workflow-brief"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import { mapResolvedIntentToRuntimeTask } from "@/lib/aim/execute-turn-intent-gate"
import {
  AccountProjectContextError,
  resolveBoundProject,
} from "@/lib/account-project-context"
import { ApiRequestError } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"

/**
 * 稳定错误码：请求指定的 `existingGenerationId` 属于同一账号但不在其绑定项目下。
 * 与现有 `ACCOUNT_PROJECT_CONTEXT_STALE` 等稳定错误码模式一致；绝不静默当作
 * “没有旧稿”继续生成，避免跨项目引用。
 */
export const EXISTING_GENERATION_NOT_IN_BOUND_PROJECT = "EXISTING_GENERATION_NOT_IN_BOUND_PROJECT"

function resolveUnifiedRuntimeInput(
  parsedRawInput: string,
  execution: NonNullable<import("@/lib/aim-harness/contracts").AimRunRequest["unifiedContentExecution"]>,
) {
  if (parsedRawInput !== execution.envelope.currentUserRequest.trim()) {
    return { ok: false as const, validationError: "统一入口 rawInput 必须等于当前用户原话" }
  }
  if (!execution.intent) {
    return { ok: false as const, validationError: "统一入口缺少结构化用户意图" }
  }
  return {
    ok: true as const,
    rawInput: parsedRawInput,
    runtimeTask: mapResolvedIntentToRuntimeTask(execution.intent),
  }
}

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

  // 基础字段校验（纯函数）：先于任何 trace / 执行解析，避免为无效请求落 trace。
  const validationError = validateGenerateInput(parsed)
  if (validationError) {
    return { ok: false as const, trace: undefined, validationError, status: 400 as const, errorCode: "INVALID_REQUEST" as const }
  }

  // 先解析账号绑定项目：正式 trace 的 projectId 只能来自服务端解析的绑定项目，
  // 绝不能用客户端传入的 projectId（它可能指向不可信项目）。
  let boundProject
  try {
    boundProject = await resolveBoundProject({
      userId,
      requestedProjectId: parsed.projectId || parsed.workflow?.projectId,
    })
    if (parsed.projectId && parsed.workflow?.projectId && parsed.projectId !== parsed.workflow.projectId) {
      throw new AccountProjectContextError("PROJECT_CONTEXT_MISMATCH", "请求中的项目上下文不一致")
    }
  } catch (error) {
    // 绑定校验失败：记录为安全/审计事件，绝不创建挂在不可信项目下的正式 trace。
    await logAimProjectContextRejection({
      source: "generate",
      userId,
      requestedProjectId: parsed.projectId || parsed.workflow?.projectId || null,
      error,
    })
    const projectError = error instanceof Error ? error.message : "账号项目上下文不可用"
    return {
      ok: false as const,
      trace: undefined,
      validationError: projectError,
      status: error instanceof AccountProjectContextError ? error.status : 409,
      errorCode: error instanceof AccountProjectContextError ? error.code : "BOUND_PROJECT_UNAVAILABLE",
    }
  }

  // 现在才创建正式 trace，projectId 为已解析的绑定项目（服务端权威值）。
  const trace = internal?.trace ?? await createAimTrace({
    id: typeof body.traceId === "string" ? (body.traceId as string).trim() || undefined : undefined,
    userId,
    projectId: boundProject.id,
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
  await addAimTraceStep(trace, {
    key: "validate_input",
    label: "输入校验",
    status: "success",
    summary: "校验通过",
  })
  await addAimTraceStep(trace, {
    key: "resolve_project_context",
    label: "账号项目绑定校验",
    status: "success",
    summary: `已锁定项目：${boundProject.name}`,
    metadata: { projectId: boundProject.id, binding: "account" },
  })

  const scopedParsed = { ...parsed, projectId: boundProject.id }
  const workflowBrief = scopedParsed.workflow
    ? await buildWorkflowBrief({ userId, ...scopedParsed.workflow, projectId: boundProject.id })
    : undefined
  const unifiedRuntime = internal?.unifiedContentExecution
    ? resolveUnifiedRuntimeInput(parsed.rawInput, internal.unifiedContentExecution)
    : undefined
  if (unifiedRuntime && !unifiedRuntime.ok) {
    return {
      ok: false as const,
      trace,
      validationError: unifiedRuntime.validationError,
      status: 400 as const,
      errorCode: "INVALID_REQUEST" as const,
    }
  }
  const preparedInput = unifiedRuntime
    ? { rawInput: unifiedRuntime.rawInput, runtimeTask: unifiedRuntime.runtimeTask }
    : await prepareAimGenerateInput({
        userId,
        agentId: scopedParsed.agentId,
        rawInput: scopedParsed.rawInput,
        targetFormats: scopedParsed.targetFormats,
        taskType: scopedParsed.taskType,
        polishInstruction: scopedParsed.polishInstruction,
        videoCopyExtractionId: scopedParsed.videoCopyExtractionId,
        useMarketViralVideos: scopedParsed.useMarketViralVideos,
        trace,
      })
  const runtimeTask = preparedInput.runtimeTask
  if (scopedParsed.confirmedTurnIntent) {
    await addAimTraceStep(trace, {
      key: "legacy_intent_observed",
      label: "旧意图字段观测",
      status: "success",
      summary: "已忽略旧意图字段的执行控制权",
      metadata: {
        action: scopedParsed.confirmedTurnIntent.action,
        scope: scopedParsed.confirmedTurnIntent.scope,
      },
    })
  }
  return {
    ok: true as const,
    userId,
    parsed: scopedParsed,
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

  // 派生到已有母稿时，复用其已确认母内容 / 内容包状态。
  // 只允许读取 id + userId + 绑定项目完全一致的记录，杜绝跨项目引用。
  let taskSpec = workflowBrief?.taskSpec
  if (parsed.existingGenerationId && !taskSpec) {
    const existing = await prisma.aimGeneration.findFirst({
      where: { id: parsed.existingGenerationId, userId, projectId },
      select: { taskSpec: true },
    })
    if (!existing) {
      throw new ApiRequestError(
        404,
        EXISTING_GENERATION_NOT_IN_BOUND_PROJECT,
        "已有作品不属于当前账号的绑定项目，无法复用",
      )
    }
    if (existing.taskSpec && typeof existing.taskSpec === "object" && !Array.isArray(existing.taskSpec)) {
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
    traceId: run.traceId,
    degraded: run.metadata.degraded,
    provider: run.metadata.provider,
    model: run.metadata.model,
    fastPath: isAimFastSpokenRoute(run.spec?.modelPolicy?.routeKey),
    qualityStatus: run.qualityStatus,
    qualityChecks: run.qualityChecks,
    qualityReport: run.qualityReport,
  }
}
