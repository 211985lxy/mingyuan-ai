import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { generateAimContent } from "@/lib/aim-generator"
import { parseGenerateBody, validateGenerateInput } from "@/lib/aim-generate-validate"
import {
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
} from "@/lib/aim-knowledge-strategy"
import {
  buildRawInputWithMarketViralContext,
  buildRawInputWithVideoCopyContext,
  buildRawInputWithTrendingContext,
  buildRawInputWithCommentInsightContext,
} from "@/lib/aim-generate-context"
import {
  addAimTraceStep,
  createAimTrace,
  failAimTrace,
  runAimTraceStep,
  summarizeText,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"

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

    const runtimeTask = await runAimTraceStep(
      trace,
      "resolve_runtime_task",
      "任务类型识别",
      () => resolveAimRuntimeTask({
        agentId: parsed.agentId,
        input: parsed.rawInput,
        taskType: parsed.taskType,
        polishInstruction: parsed.polishInstruction,
        targetFormats: parsed.targetFormats,
      }),
      (task) => ({ summary: task, metadata: { runtimeTask: task } }),
    )
    const withVideoCopyContext = shouldUseKnowledgeContextForTask(runtimeTask)
      ? await runAimTraceStep(
          trace,
          "video_copy_context",
          "爆款拆解上下文注入",
          () => buildRawInputWithVideoCopyContext(
            user.id,
            parsed.rawInput,
            parsed.videoCopyExtractionId,
          ),
          (value) => ({
            summary: value === parsed.rawInput ? "未注入爆款拆解" : "已注入爆款拆解",
            metadata: { chars: value.length },
          }),
        )
      : parsed.rawInput

    if (!shouldUseKnowledgeContextForTask(runtimeTask)) {
      await addAimTraceStep(trace, {
        key: "video_copy_context",
        label: "爆款拆解上下文注入",
        status: "skipped",
        summary: "轻改任务跳过爆款拆解",
      })
    }

    const rawInput = await runAimTraceStep(
      trace,
      "market_viral_context",
      "市场爆款上下文注入",
      () => buildRawInputWithMarketViralContext(
        user.id,
        withVideoCopyContext,
        parsed.useMarketViralVideos !== false && shouldUseMarketViralContextForTask(runtimeTask),
      ),
      (value) => ({
        summary: value === withVideoCopyContext ? "未注入市场爆款" : "已注入市场爆款",
        metadata: { chars: value.length },
      }),
    )

    // ── 热榜上下文注入（RedFox 实时热榜 TOP10） ──
    const useTrending = parsed.useMarketViralVideos !== false && shouldUseMarketViralContextForTask(runtimeTask)
    const withTrendingContext = await runAimTraceStep(
      trace,
      "trending_context",
      "全网热榜上下文注入",
      () => buildRawInputWithTrendingContext(rawInput, useTrending),
      (value) => ({
        summary: value === rawInput ? "未注入热榜" : "已注入全网热榜",
        metadata: { chars: value.length },
      }),
    )

    // ── 对标账号热评洞察注入（RedFox 评论 API） ──
    const withCommentContext = await runAimTraceStep(
      trace,
      "comment_insight_context",
      "对标账号热评洞察注入",
      () => buildRawInputWithCommentInsightContext(
        user.id,
        withTrendingContext,
        useTrending,
      ),
      (value) => ({
        summary: value === withTrendingContext ? "未注入热评洞察" : "已注入对标账号热评洞察",
        metadata: { chars: value.length },
      }),
    )

    const result = await generateAimContent({
      userId: user.id,
      projectId: parsed.projectId,
      rawInput: withCommentContext,
      agentId: parsed.agentId,
      targetFormats: parsed.targetFormats,
      taskType: parsed.taskType,
      topicTitle: parsed.topicTitle,
      topicRationale: parsed.topicRationale,
      topicType: parsed.topicType,
      hotTopic: parsed.hotTopic,
      polishInstruction: parsed.polishInstruction,
      videoCopyExtractionId: parsed.videoCopyExtractionId,
      existingGenerationId: parsed.existingGenerationId,
      runtimeTask,
      trace,
    })

    // ── 后置质检（含 RedFox 违禁词检测） ──
    // ponytail: quality gate is tuned for publishable short-form scripts, not planning/diagnosis raw_copy.
    const qualityGateFormats = new Set(["video_script", "koubo_script", "xiaohongshu_post"])
    const firstQualityCandidate = result.results.find((item) =>
      item.content?.trim() && qualityGateFormats.has(item.format)
    )
    const needsQualityCheck =
      parsed.agentId !== "persona" &&
      parsed.agentId !== "free_copywriter" &&
      parsed.taskType !== "polish_copy" &&
      parsed.taskType !== "quality_check" &&
      !!firstQualityCandidate

    if (needsQualityCheck && firstQualityCandidate) {
      try {
        const { runQualityCheck } = await import("@/lib/quality-gate")
        const qualityReport = await runAimTraceStep(
          trace,
          "quality_gate",
          "生成后质检（含违禁词检测）",
          () => runQualityCheck({
            content: firstQualityCandidate.content,
            topicTitle: parsed.topicTitle,
          }),
          (report) => ({
            summary: `质检得分 ${report.overall.score}/10，${report.overall.passed ? "通过" : "未通过"}`,
            metadata: {
              overallScore: report.overall.score,
              passed: report.overall.passed,
              editorialScore: report.editorial.score,
              aiTasteScore: report.aiTaste.score,
              attractionScore: report.attraction.score,
              logicScore: report.logic.score,
              hasCompliance: !!report.compliance,
              compliancePassed: report.compliance?.passed,
            },
          }),
        )
        // 将质检报告附加到返回结果中（前端可展示）
        return NextResponse.json({
          ...result,
          qualityReport: {
            overallScore: qualityReport.overall.score,
            passed: qualityReport.overall.passed,
            editorial: qualityReport.editorial.score,
            aiTaste: qualityReport.aiTaste.score,
            attraction: qualityReport.attraction.score,
            logic: qualityReport.logic.score,
            compliance: qualityReport.compliance
              ? { passed: qualityReport.compliance.passed, violations: qualityReport.compliance.violations.length }
              : undefined,
          },
        })
      } catch (err) {
        // 质检失败不阻断生成结果，仅记录
        console.warn("[aim/generate] Quality gate check failed:", err)
        await addAimTraceStep(trace, {
          key: "quality_gate",
          label: "生成后质检（含违禁词检测）",
          status: "skipped",
          summary: "质检执行异常，已跳过",
        })
      }
    }

    return NextResponse.json(result)
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
