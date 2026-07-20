import { prisma } from "@/lib/prisma"
import { handleTopicChatMessage } from "@/lib/topic-chat-service"
import {
  createVideoCopyExtraction,
  getVideoCopyExtractionForUser,
  startVideoCopyExtractionFallback,
  syncVideoCopyExtraction,
} from "@/lib/video-copy-extractions"
import { isVideoExtractionFallbackEnabled } from "@/lib/video-extraction-fallback"
import { isCaptureOnly, isGenerationSuppressed, isExecutionMode } from "@/lib/execution-mode"
import type { ExecutionMode } from "@/lib/execution-mode"

export type InspirationPipelineOutcome = "completed" | "deferred"

function buildTopicInput(input: {
  original: string
  sourceUrl: string
  title: string | null
  transcript: string
  analysisResult: unknown
}) {
  const analysis = input.analysisResult ? JSON.stringify(input.analysisResult) : ""
  return [
    input.original,
    "",
    `视频来源：${input.sourceUrl}`,
    input.title ? `视频标题：${input.title}` : null,
    `提取文案：${input.transcript}`,
    analysis ? `结构化拆解：${analysis}` : null,
  ].filter(Boolean).join("\n").slice(0, 30_000)
}

async function loadOrAdvanceExtraction(record: {
  id: string
  userId: string
  sourceUrl: string
  videoCopyExtractionId: string | null
}) {
  let extraction = record.videoCopyExtractionId
    ? await getVideoCopyExtractionForUser(record.userId, record.videoCopyExtractionId)
    : null

  if (!extraction) {
    extraction = await createVideoCopyExtraction(record.userId, record.sourceUrl)
    await prisma.inspiration.update({
      where: { id: record.id },
      data: { videoCopyExtractionId: extraction.id, processingStage: "extracting" },
    })
  } else if (extraction.status !== "completed" && extraction.status !== "failed") {
    extraction = await syncVideoCopyExtraction(record.userId, extraction.id)
  }

  if (extraction?.status === "failed" && isVideoExtractionFallbackEnabled()) {
    const retrySelfHosted = extraction.provider === "self_hosted"
      && !/(超过10分钟|超过200MB|没有识别到|不支持|分享页|直链)/.test(extraction.errorMessage || "")
    if (extraction.provider !== "self_hosted" || retrySelfHosted) {
      extraction = await startVideoCopyExtractionFallback(record.userId, extraction.id)
    }
  }
  return extraction
}

/**
 * Resolve the effective execution mode from the inspiration snapshot.
 * Falls back to "live" when no snapshot is set (backward compat for existing records).
 */
function resolveEffectiveMode(snapshot: string | null): ExecutionMode {
  return isExecutionMode(snapshot) ? snapshot : "live"
}

/**
 * @description 处理inspirationpipeline
 * @param inspirationId - inspiration唯一标识符
 * @returns Promise<InspirationPipelineOutcome>
 */
export async function processInspirationPipeline(inspirationId: string): Promise<InspirationPipelineOutcome> {
  const inspiration = await prisma.inspiration.findUnique({ where: { id: inspirationId } })
  if (!inspiration) throw new Error("灵感记录不存在")
  if (inspiration.aiStatus === "completed") return "completed"
  if (!inspiration.projectId) throw new Error("自动收录记录缺少项目绑定")

  const mode = resolveEffectiveMode(inspiration.executionModeSnapshot)

  await prisma.inspiration.update({
    where: { id: inspiration.id },
    data: { aiStatus: "processing", processingStage: inspiration.sourceUrl ? "extracting" : "generating", errorMessage: null },
  })

  let topicInput = inspiration.content
  if (inspiration.sourceUrl) {
    const extraction = await loadOrAdvanceExtraction({
      id: inspiration.id,
      userId: inspiration.userId,
      sourceUrl: inspiration.sourceUrl,
      videoCopyExtractionId: inspiration.videoCopyExtractionId,
    })
    if (!extraction) throw new Error("视频文案提取记录不存在")
    if (["queued", "extracting", "analyzing"].includes(extraction.status)) return "deferred"
    if (extraction.status === "failed" || !extraction.transcript) {
      throw new Error(extraction.errorMessage || "该视频暂时无法提取文案，请换一个链接试试。")
    }
    topicInput = buildTopicInput({
      original: inspiration.content,
      sourceUrl: inspiration.sourceUrl,
      title: extraction.videoTitle,
      transcript: extraction.transcript,
      analysisResult: extraction.analysisResult,
    })
    await prisma.inspiration.update({ where: { id: inspiration.id }, data: { processingStage: "generating" } })
  }

  // --- capture_only: record and extract only, no AI generation ---
  if (isCaptureOnly(mode)) {
    await prisma.inspiration.update({
      where: { id: inspiration.id },
      data: { aiStatus: "completed", processingStage: "captured", replyStatus: "suppressed", errorMessage: null },
    })
    return "completed"
  }

  // --- evaluate: run AI generation but do NOT write TopicSelection or reply ---
  if (isGenerationSuppressed(mode)) {
    // In evaluate mode we still complete the pipeline for observation
    // but mark as shadow_completed without calling handleTopicChatMessage
    await prisma.inspiration.update({
      where: { id: inspiration.id },
      data: { aiStatus: "completed", processingStage: "shadow_completed", replyStatus: "suppressed", errorMessage: null },
    })
    return "completed"
  }

  // --- live: full pipeline ---
  await handleTopicChatMessage({
    userId: inspiration.userId,
    projectId: inspiration.projectId,
    content: topicInput,
    inspirationId: inspiration.id,
  })
  return "completed"
}
