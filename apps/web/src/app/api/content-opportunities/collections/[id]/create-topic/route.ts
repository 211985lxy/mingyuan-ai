import { NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { createTopicBodySchema } from "@/features/opportunities/contracts/api"

/**
 * POST /api/content-opportunities/collections/[id]/create-topic
 * 将研究篮中的候选选题转入选题工作台（TopicSelection）
 */
export const POST = withUserAuth(async (request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少研究篮 ID" }, { status: 400 })
  }
  const body = await parseJsonBody(request, createTopicBodySchema, { maxBytes: 4 * 1024 })

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  // 获取用户的 IP Profile
  const ipProfile = await prisma.ipProfile.findUnique({
    where: { userId: user.id },
  })

  if (!ipProfile) {
    return NextResponse.json({ error: "请先完成 IP 档案配置" }, { status: 400 })
  }

  // 创建 TopicSelection 记录
  const topicSelection = await prisma.topicSelection.create({
    data: {
      userId: user.id,
      ipProfileId: ipProfile.id,
      elementCodes: { source: "opportunity_collection", collectionId: id },
      candidates: [{
        title: body.topicTitle,
        angle: body.angle ?? "",
        rationale: body.rationale ?? "",
        source: "content_opportunity",
      }],
      selectedIndex: 0,
      promptText: `[内容机会] ${body.topicTitle}${body.angle ? ` — 角度：${body.angle}` : ""}`,
      sourceHighlights: { collectionId: id, collectionName: collection.name },
      model: "opportunity-search",
      status: "pending",
      recommendationMode: "normal",
    },
  })

  return NextResponse.json({
    topicSelectionId: topicSelection.id,
    message: "已转入选题工作台",
  }, { status: 201 })
})
