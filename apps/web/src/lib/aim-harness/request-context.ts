import { extractLatestAimUserIntentText } from "@/lib/aim-current-user-input"
import {
  buildRawInputWithCommentInsightContext,
  buildRawInputWithMarketViralContext,
  buildRawInputWithTrendingContext,
  buildRawInputWithVideoCopyContext,
} from "@/lib/aim-generate-context"
import type { ContentFormat } from "@/lib/aim-generator"
import {
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
} from "@/lib/aim-knowledge-strategy"
import { addAimTraceStep, runAimTraceStep, type AimTraceRecorder } from "@/lib/aim-observability"

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function shouldBypassAuxiliaryContext(agentId: string | undefined, rawInput: string) {
  if (agentId !== "business_diagnosis") return false
  const text = extractLatestAimUserIntentText(rawInput).replace(/\s+/g, "")
  if (!text) return false
  if (!includesAny(text, ["会议纪要", "会议记录", "访谈纪要", "逐字稿", "录音整理", "妙记"])) return false
  return includesAny(text, [
    "内容资产包", "整理", "总结", "提炼", "纪要", "选题", "采访清单", "任务清单", "脚本模板",
    "会议一句话结论", "关键信息抽取表", "核心矛盾/机会",
  ])
}

/**
 * 把普通生成入口的辅助上下文注入收口到 Harness 边界。
 * Route 只负责鉴权、校验和响应序列化。
 */
export async function prepareAimGenerateInput(input: {
  userId: string
  agentId?: string
  rawInput: string
  targetFormats: ContentFormat[]
  taskType?: string
  polishInstruction?: string
  videoCopyExtractionId?: string
  useMarketViralVideos?: boolean
  trace?: AimTraceRecorder
}) {
  const runtimeTask = await runAimTraceStep(
    input.trace,
    "resolve_runtime_task",
    "任务类型识别",
    () => resolveAimRuntimeTask({
      agentId: input.agentId,
      input: input.rawInput,
      taskType: input.taskType,
      polishInstruction: input.polishInstruction,
      targetFormats: input.targetFormats,
    }),
    (task) => ({ summary: task, metadata: { runtimeTask: task } }),
  )

  const bypassAuxiliaryContext = shouldBypassAuxiliaryContext(input.agentId, input.rawInput)
  const withVideoCopyContext = shouldUseKnowledgeContextForTask(runtimeTask) && !bypassAuxiliaryContext
    ? await runAimTraceStep(
        input.trace,
        "video_copy_context",
        "爆款拆解上下文注入",
        () => buildRawInputWithVideoCopyContext(input.userId, input.rawInput, input.videoCopyExtractionId),
        (value) => ({
          summary: value === input.rawInput ? "未注入爆款拆解" : "已注入爆款拆解",
          metadata: { chars: value.length },
        }),
      )
    : input.rawInput

  if (!shouldUseKnowledgeContextForTask(runtimeTask) || bypassAuxiliaryContext) {
    await addAimTraceStep(input.trace, {
      key: "video_copy_context",
      label: "爆款拆解上下文注入",
      status: "skipped",
      summary: bypassAuxiliaryContext ? "会议纪要模式跳过爆款拆解" : "轻改任务跳过爆款拆解",
    })
  }

  const useMarketSignals =
    !bypassAuxiliaryContext
    && input.useMarketViralVideos !== false
    && shouldUseMarketViralContextForTask(runtimeTask)

  const withMarketContext = await runAimTraceStep(
    input.trace,
    "market_viral_context",
    "市场爆款上下文注入",
    () => buildRawInputWithMarketViralContext(input.userId, withVideoCopyContext, useMarketSignals),
    (value) => ({
      summary: value === withVideoCopyContext ? "未注入市场爆款" : "已注入市场爆款",
      metadata: { chars: value.length },
    }),
  )
  const withTrendingContext = await runAimTraceStep(
    input.trace,
    "trending_context",
    "全网热榜上下文注入",
    () => buildRawInputWithTrendingContext(withMarketContext, useMarketSignals),
    (value) => ({
      summary: value === withMarketContext ? "未注入热榜" : "已注入全网热榜",
      metadata: { chars: value.length },
    }),
  )
  const rawInput = await runAimTraceStep(
    input.trace,
    "comment_insight_context",
    "对标账号热评洞察注入",
    () => buildRawInputWithCommentInsightContext(input.userId, withTrendingContext, useMarketSignals),
    (value) => ({
      summary: value === withTrendingContext ? "未注入热评洞察" : "已注入对标账号热评洞察",
      metadata: { chars: value.length },
    }),
  )

  return { rawInput, runtimeTask }
}
