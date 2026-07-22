import { NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { createTopicBodySchema } from "@/features/opportunities/contracts/api"
import type { CollectionAnalysis } from "@/features/opportunities/contracts/types"

/**
 * POST /api/content-opportunities/collections/:id/create-topic
 * 将研究结果中的候选选题转换为现有 TopicSelection
 */
export const POST = withUserAuth(async (request, { user, params }) => {
  const { id } = await params
  const body = await parseJsonBody(request, createTopicBodySchema, { maxBytes: 4 * 1024 })

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  if (collection.status !== "analyzed" || !collection.analysisResult) {
    return NextResponse.json({ error: "研究篮尚未完成分析" }, { status: 400 })
  }

  const analysis = collection.analysisResult as unknown as CollectionAnalysis
  const topic = analysis.candidateTopics?.[body.topicIndex]
  if (!topic) {
    return NextResponse.json({ error: `候选选题 #${body.topicIndex} 不存在` }, { status: 404 })
  }

  // Build source highlights from referenced samples
  const items = collection.items as unknown as Array<{ title?: string; sourceUrl?: string; platform?: string }>
  const sourceHighlights = (topic.referencedSamples ?? []).map((ref) => {
    const idx = Number(ref.replace(/\D/g, ""))
    const sample = Array.isArray(items) ? items[idx] : null
    return {
      ref,
      title: sample?.title ?? ref,
      sourceUrl: sample?.sourceUrl ?? "",
      platform: sample?.platform ?? "douyin",
    }
  })

  // Create TopicSelection using existing model
  const topicSelection = await prisma.topicSelection.create({
    data: {
      userId: user.id,
      ipProfileId: body.ipProfileId,
      elementCodes: ["content_opportunity"],
      candidates: [
        {
          title: topic.title,
          angle: topic.angle,
          rationale: topic.rationale,
          riskNote: topic.riskNote ?? null,
          source: "content_opportunity",
          collectionId: id,
        },
      ],
      selectedIndex: 0,
      promptText: `[内容机会研究] ${topic.title}\n切入角度：${topic.angle}\n依据：${topic.rationale}`,
      sourceHighlights,
      model: "glm-5.2",
      status: "selected",
    },
  })

  return NextResponse.json({
    topicSelectionId: topicSelection.id,
    title: topic.title,
    message: "选题已创建，可前往 AIM 创作",
  }, { status: 201 })
})
