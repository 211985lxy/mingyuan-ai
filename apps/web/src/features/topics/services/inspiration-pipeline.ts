import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
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
import { generateTopicCards } from "@/lib/topic-generation"
import {
  classifyTopicChatInput,
  buildTopicKnowledgeDraft,
} from "@/lib/topic-chat"
import {
  buildTopicProjectSource,
  loadTopicChatContext,
} from "@/lib/topics/chat-context"

export type InspirationPipelineOutcome = "completed" | "deferred"

export type InspirationPipelineResult = {
  outcome: InspirationPipelineOutcome
  topicSelectionId?: string
}

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

/** Known permanent extraction failure patterns — these should NOT be retried via fallback. */
const PERMANENT_EXTRACTION_FAILURE_PATTERNS = [
  /video.*too.*long/i,
  /video.*too.*large/i,
  /no.*transcript/i,
  /unsupported.*video/i,
  /direct.*link/i,
  /share.*page/i,
  // Backward compat: existing Chinese error messages in DB
  /超过10分钟/,
  /超过200MB/,
  /没有识别到/,
  /不支持/,
  /分享页/,
  /直链/,
]

function isPermanentExtractionFailure(errorMessage: string): boolean {
  return PERMANENT_EXTRACTION_FAILURE_PATTERNS.some((p) => p.test(errorMessage))
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
      && !isPermanentExtractionFailure(extraction.errorMessage || "")
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
export async function processInspirationPipeline(inspirationId: string): Promise<InspirationPipelineResult> {
  const inspiration = await prisma.inspiration.findUnique({ where: { id: inspirationId } })
  if (!inspiration) throw new Error("灵感记录不存在")
  if (inspiration.aiStatus === "completed") return { outcome: "completed" }
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
    if (["queued", "extracting", "analyzing"].includes(extraction.status)) return { outcome: "deferred" }
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
    return { outcome: "completed" }
  }

  // --- evaluate: run AI generation but do NOT write TopicSelection or reply ---
  if (isGenerationSuppressed(mode)) {
    try {
      const [project, elements, ipProfile] = await loadTopicChatContext({
        userId: inspiration.userId,
        projectId: inspiration.projectId,
      })
      if (project && ipProfile) {
        const classification = classifyTopicChatInput(topicInput)
        const draft = buildTopicKnowledgeDraft({ content: topicInput, classification })
        const projectSource = buildTopicProjectSource(project)
        const genResult = await generateTopicCards({
          ipProfile,
          elements,
          topicSources: [
            { category: "client_project", title: project.name, content: projectSource || project.name },
            { category: draft.category, title: draft.title, content: draft.content },
          ],
          recommendationMode: "normal",
          refreshCount: 0,
        })
        // Store generated candidates on the Inspiration for observation,
        // but do NOT write TopicSelection or KnowledgeEntry
        if (genResult.success) {
          await prisma.inspiration.update({
            where: { id: inspiration.id },
            data: {
              aiStatus: "completed",
              processingStage: "shadow_completed",
              generatedTopics: genResult.cards as unknown as Prisma.InputJsonValue,
              replyStatus: "suppressed",
              errorMessage: null,
            },
          })
          return { outcome: "completed" }
        }
      }
      // Fallback: no project context or generation failed
      await prisma.inspiration.update({
        where: { id: inspiration.id },
        data: { aiStatus: "completed", processingStage: "shadow_completed", replyStatus: "suppressed", errorMessage: null },
      })
      return { outcome: "completed" }
    } catch (evalError) {
      const evalMsg = evalError instanceof Error ? evalError.message : String(evalError)
      // Evaluate mode should not hard-fail — record the error but mark as shadow_completed
      await prisma.inspiration.update({
        where: { id: inspiration.id },
        data: { aiStatus: "completed", processingStage: "shadow_completed", replyStatus: "suppressed", errorMessage: evalMsg },
      })
      return { outcome: "completed" }
    }
  }

  // --- live: full pipeline ---
  const result = await handleTopicChatMessage({
    userId: inspiration.userId,
    projectId: inspiration.projectId,
    content: topicInput,
    inspirationId: inspiration.id,
  })
  return { outcome: "completed", topicSelectionId: result.topicSelectionId }
}
