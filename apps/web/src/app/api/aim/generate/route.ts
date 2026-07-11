import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import {
  addAimTraceStep,
  createAimTrace,
  failAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { prepareAimGenerateInput } from "@/lib/aim-harness/request-context"
import { buildWorkflowBrief } from "@/lib/aim-workflow-brief"

export async function POST(request: NextRequest) {
  let trace: AimTraceRecorder | undefined
  try {
    const user = await authenticateRequest(request)
    const quotaResponse = await enforceDailyBetaLimit(user.id, "aim_generate")
    if (quotaResponse) return quotaResponse

    const body = await request.json()
    const parsed = parseGenerateBody(body)
    trace = await createAimTrace({
      userId: user.id,
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
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Workflow context is deliberately rebuilt here. The browser may suggest a
    // goal and constraints, but project facts and source records are always
    // re-authorized for the current user before they reach the model.
    const workflowBrief = parsed.workflow
      ? await buildWorkflowBrief({
          userId: user.id,
          ...parsed.workflow,
          projectId: parsed.workflow.projectId || parsed.projectId || undefined,
        })
      : undefined

    const { rawInput: withCommentContext, runtimeTask } = await prepareAimGenerateInput({
      userId: user.id,
      agentId: parsed.agentId,
      rawInput: parsed.rawInput,
      targetFormats: parsed.targetFormats,
      taskType: parsed.taskType,
      polishInstruction: parsed.polishInstruction,
      videoCopyExtractionId: parsed.videoCopyExtractionId,
      useMarketViralVideos: parsed.useMarketViralVideos,
      trace,
    })

    const effectiveProjectId = workflowBrief?.projectId || parsed.projectId
    const run = await executeAimRun({
      entrypoint: "generate",
      rawInput: withCommentContext,
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
      taskSpec: workflowBrief?.taskSpec,
      actorId: user.id,
      projectId: effectiveProjectId,
      trace,
    }, (spec) => executeAimGenerationDomain(spec, {
          userId: user.id,
          projectId: effectiveProjectId,
          rawInput: withCommentContext,
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
          taskSpec: workflowBrief?.taskSpec,
        }))

    const result = run.output

    if (run.qualityReport) {
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

    return NextResponse.json({
      ...result,
      // Additive optional fields (Phase 4): runId, degraded, provider, model,
      // qualityStatus and deterministic per-format qualityChecks. Existing
      // qualityReport keeps its meaning (main-draft LLM score).
      runId: run.metadata.runId,
      degraded: run.metadata.degraded,
      provider: run.metadata.provider,
      model: run.metadata.model,
      qualityStatus: run.qualityStatus,
      qualityChecks: run.qualityChecks,
      qualityReport: run.qualityReport,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[aim/generate] Error:", error)
    await failAimTrace(trace, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成失败" },
      { status: 500 }
    )
  }
}
