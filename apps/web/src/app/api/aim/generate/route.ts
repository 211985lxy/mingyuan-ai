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
import { extractLatestAimUserIntentText } from "@/lib/aim-current-user-input"
import { runAimGenerate } from "@/lib/aim-harness/adapters"

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function shouldBypassAuxiliaryContext(agentId: string | undefined, rawInput: string) {
  if (agentId !== "business_diagnosis") return false

  const text = extractLatestAimUserIntentText(rawInput).replace(/\s+/g, "")
  if (!text) return false

  const mentionsMeetingMaterial = includesAny(text, [
    "会议纪要",
    "会议记录",
    "访谈纪要",
    "逐字稿",
    "录音整理",
    "妙记",
  ])
  if (!mentionsMeetingMaterial) return false

  return (
    includesAny(text, [
      "内容资产包",
      "整理",
      "总结",
      "提炼",
      "纪要",
      "选题",
      "采访清单",
      "任务清单",
      "脚本模板",
    ]) ||
    includesAny(text, ["会议一句话结论", "关键信息抽取表", "核心矛盾/机会"])
  )
}

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
    const bypassAuxiliaryContext = shouldBypassAuxiliaryContext(parsed.agentId, parsed.rawInput)
    const withVideoCopyContext = shouldUseKnowledgeContextForTask(runtimeTask) && !bypassAuxiliaryContext
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

    if (!shouldUseKnowledgeContextForTask(runtimeTask) || bypassAuxiliaryContext) {
      await addAimTraceStep(trace, {
        key: "video_copy_context",
        label: "爆款拆解上下文注入",
        status: "skipped",
        summary: bypassAuxiliaryContext ? "会议纪要模式跳过爆款拆解" : "轻改任务跳过爆款拆解",
      })
    }

    const useMarketSignals =
      !bypassAuxiliaryContext &&
      parsed.useMarketViralVideos !== false &&
      shouldUseMarketViralContextForTask(runtimeTask)

    const rawInput = await runAimTraceStep(
      trace,
      "market_viral_context",
      "市场爆款上下文注入",
      () => buildRawInputWithMarketViralContext(
        user.id,
        withVideoCopyContext,
        useMarketSignals,
      ),
      (value) => ({
        summary: value === withVideoCopyContext ? "未注入市场爆款" : "已注入市场爆款",
        metadata: { chars: value.length },
      }),
    )

    // ── 热榜上下文注入（RedFox 实时热榜 TOP10） ──
    const useTrending = useMarketSignals
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

    // ── aim-harness-v1: generate through the thin harness ──
    // The harness wraps generateAimContent unchanged, capturing runId / real
    // provider+model / fallbackIndex / degraded / promptHash / contextHash,
    // persisting an AimRunSnapshot and stamping the trace. It also runs the
    // deterministic validators on every format + the main-draft LLM report
    // (read-only; auto-rewrite stays off the main path).
    const harness = await runAimGenerate({
      execute: () =>
        generateAimContent({
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
          topicSelectionId: parsed.topicSelectionId,
          selectedTopicIndex: parsed.selectedTopicIndex,
          runtimeTask,
          trace,
        }),
      rawInput: withCommentContext,
      agentId: parsed.agentId || "content_producer",
      targetFormats: parsed.targetFormats,
      taskType: parsed.taskType,
      polishInstruction: parsed.polishInstruction,
      topicType: parsed.topicType,
      hotTopic: parsed.hotTopic,
      entrypoint: "generate",
      trace,
      userId: user.id,
      projectId: parsed.projectId || null,
    })

    const result = harness.result

    if (harness.qualityReport) {
      await runAimTraceStep(
        trace,
        "quality_gate",
        "生成后质检（含违禁词检测）",
        async () => harness.qualityReport as Record<string, unknown>,
        (report) => ({
          summary: `质检得分 ${(report as { overallScore?: number }).overallScore ?? "-"}/10，${(report as { passed?: boolean }).passed ? "通过" : "未通过"}`,
          metadata: {
            ...report,
            runId: harness.runId,
            degraded: harness.degraded,
            provider: harness.provider,
            model: harness.model,
            qualityStatus: harness.qualityStatus,
          },
        }),
      )
    }

    return NextResponse.json({
      ...result,
      // Additive optional fields (Phase 4): runId, degraded, provider, model,
      // qualityStatus and deterministic per-format qualityChecks. Existing
      // qualityReport keeps its meaning (main-draft LLM score).
      runId: harness.runId,
      degraded: harness.degraded,
      provider: harness.provider,
      model: harness.model,
      qualityStatus: harness.qualityStatus,
      qualityChecks: harness.qualityChecks,
      qualityReport: harness.qualityReport,
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
