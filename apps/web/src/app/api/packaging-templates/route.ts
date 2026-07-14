import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import {
  normalizePackagingTemplateCapabilities,
  recommendPackagingTemplate,
} from "@/lib/video-template-config"

// ─── GET /api/packaging-templates ─────────────────────

const RECOMMENDATION_ORDER = {
  recommended: 0,
  acceptable: 1,
  weak_fit: 2,
  blocked: 3,
} as const

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const scene = searchParams.get("scene")
  const structureId = searchParams.get("structureId")
  const scriptId = searchParams.get("scriptId")

  const where: { status: string; scene?: string } = { status: "published" }
  if (scene) where.scene = scene

  const [templates, structure, script] = await Promise.all([
    prisma.videoPackagingTemplate.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    }),
    structureId
      ? prisma.videoStructure.findFirst({
          where: {
            OR: [{ id: structureId }, { name: structureId }],
            status: "published",
          },
          select: { id: true, blueprint: true },
        })
      : Promise.resolve(null),
    scriptId
      ? prisma.script.findFirst({
          where: { id: scriptId, userId: user.id },
          select: { id: true, userId: true, content: true },
        })
      : Promise.resolve(null),
  ])

  const authorizedScript = script

  const decorated = templates.map((template) => {
    const capabilities = normalizePackagingTemplateCapabilities({
      capabilities: template.capabilities,
      name: template.name,
      description: template.description,
    })

    const recommendation = structure
      ? recommendPackagingTemplate({
          template: {
            id: template.id,
            name: template.name,
            description: template.description,
            capabilities,
          },
          structureBlueprint: structure.blueprint as unknown as Parameters<
            typeof recommendPackagingTemplate
          >[0]["structureBlueprint"],
          structureId: structure.id,
          scriptId: authorizedScript?.id ?? null,
          scriptContent: authorizedScript?.content ?? null,
        })
      : null

    return {
      ...template,
      capabilities,
      recommendation,
    }
  })

  const sorted = [...decorated].sort((left, right) => {
    const leftTier = left.recommendation?.tier ?? "acceptable"
    const rightTier = right.recommendation?.tier ?? "acceptable"
    const tierCompare = RECOMMENDATION_ORDER[leftTier] - RECOMMENDATION_ORDER[rightTier]
    if (tierCompare !== 0) return tierCompare

    const scoreCompare = (right.recommendation?.score ?? 0) - (left.recommendation?.score ?? 0)
    if (scoreCompare !== 0) return scoreCompare

    return left.sortOrder - right.sortOrder
  })

  return NextResponse.json({ data: sorted })
})
