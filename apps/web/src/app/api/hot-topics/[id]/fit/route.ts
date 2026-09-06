import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  HotTopicIntelligenceError,
  evaluateHotTopicFit,
  getOrGenerateHotTopicInsight,
} from "@/lib/hot-topic-intelligence"
import type { ExpressionBlueprint } from "@/types/content-template"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const POST = withUserAuth(async (request, { user, params }) => {
  const topicId = params?.id
  if (!topicId) {
    return NextResponse.json({ error: "Missing topic id" }, { status: 400 })
  }

  const body = await parseJsonRecord(request)
  const templateId = typeof body.templateId === "string" ? body.templateId : ""
  const structureId = typeof body.structureId === "string" ? body.structureId : ""
  const inputs =
    body.inputs && typeof body.inputs === "object"
      ? (body.inputs as Record<string, string>)
      : {}

  if (!templateId || !structureId) {
    return NextResponse.json(
      { error: "templateId and structureId are required" },
      { status: 400 },
    )
  }

  // 结构模板（含提取结构）必须归属于当前账号的绑定项目，避免引用他人/历史空项目
  // 结构把 blueprint 喂进 fit 模型。canonical 公共模板除外（天然无项目）。
  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId: typeof body.projectId === "string" ? body.projectId : undefined,
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  const [{ topic, insight }, template, structure] = await Promise.all([
    getOrGenerateHotTopicInsight(topicId),
    prisma.contentTemplate.findUnique({
      where: { id: templateId, status: "published" },
      select: {
        id: true,
        displayName: true,
        description: true,
        hookType: true,
        scriptTemplate: true,
        expressionBlueprint: true,
      },
    }),
    prisma.videoStructure.findFirst({
      where: {
        OR: [{ id: structureId }, { name: structureId }],
        status: "published",
        AND: [{
          OR: [
            { origin: "canonical" },
            { origin: "extracted", userId: user.id, projectId },
          ],
        }],
      },
      select: {
        id: true,
        displayName: true,
        blueprint: true,
      },
    }),
  ])

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }

  if (!structure) {
    return NextResponse.json({ error: "Video structure not found" }, { status: 400 })
  }

  try {
    const expressionBlueprint = template.expressionBlueprint as ExpressionBlueprint | null
    const fit = await evaluateHotTopicFit({
      topicTitle: topic.title,
      insight,
      ipProfile: undefined,
      template: {
        ...template,
        expressionBlueprint,
      },
      structure: {
        id: structure.id,
        displayName: structure.displayName,
        blueprint: structure.blueprint as {
          openingPattern: string
          narrativeBeats: string[]
          evidenceSlots: number
          ctaSlot: string
          durationRange: { min: number; max: number }
        },
      },
      inputs,
    })

    return NextResponse.json({
      data: {
        topic,
        insight,
        fit,
      },
    })
  } catch (error) {
    if (error instanceof HotTopicIntelligenceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }

    console.error("[hot-topics/fit] unexpected error:", error)
    return NextResponse.json(
      { error: "热点适配评估失败" },
      { status: 500 },
    )
  }
})
