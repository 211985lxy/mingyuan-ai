import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { signOssUrls } from "@/lib/oss"
import {
  normalizePackagingInputs,
  PackagingInputError,
} from "@/lib/packaging-assets"
import {
  asJsonRecord,
  mergeJsonRecords,
  resolveContentTemplatePlanDefaults,
} from "@/lib/video-template-config"

// ─── POST /api/production-plans ───────────────────────

export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json()
  const {
    scriptId,
    contentTemplateId,
    packagingTemplateId,
    structureId,
    styleId,
    materials,
    backgroundMusic,
    packRules,
    processRules,
    recommendationContext,
    videoType,
  } = body

  // Validate required fields
  if (!scriptId) {
    return NextResponse.json(
      { error: "scriptId is required" },
      { status: 400 }
    )
  }

  if (!styleId && !packagingTemplateId && !contentTemplateId) {
    return NextResponse.json(
      { error: "styleId, packagingTemplateId, or contentTemplateId is required" },
      { status: 400 }
    )
  }

  // Validate the script belongs to the user
  const script = await prisma.script.findFirst({
    where: { id: scriptId, userId: user.id },
    select: { id: true, userId: true },
  })

  if (!script) {
    return NextResponse.json(
      { error: "Script not found" },
      { status: 404 }
    )
  }

  const contentTemplate = contentTemplateId
    ? await prisma.contentTemplate.findUnique({
        where: { id: contentTemplateId, status: "published" },
        select: {
          id: true,
          shanjianStyleId: true,
          videoType: true,
          packRulesJson: true,
          processRulesJson: true,
        },
      })
    : null

  if (contentTemplateId && !contentTemplate) {
    return NextResponse.json(
      { error: "Content template not found" },
      { status: 404 }
    )
  }

  const templateDefaults = resolveContentTemplatePlanDefaults(contentTemplate)

  // Resolve styleId from content template, then let packaging override it if selected
  let resolvedPackagingTemplateId = packagingTemplateId ?? null
  let resolvedStyleId = styleId ?? templateDefaults?.styleId ?? null
  const resolvedVideoType = videoType ?? templateDefaults?.videoType ?? "virtualman_broadcast"
  const resolvedPackRules = mergeJsonRecords(
    templateDefaults?.packRules,
    asJsonRecord(packRules),
  )
  const resolvedProcessRules = mergeJsonRecords(
    templateDefaults?.processRules,
    asJsonRecord(processRules),
  )

  if (resolvedPackagingTemplateId) {
    const packagingTemplate = await prisma.videoPackagingTemplate.findUnique({
      where: { id: resolvedPackagingTemplateId },
      select: { id: true, shanjianId: true },
    })

    if (!packagingTemplate) {
      return NextResponse.json(
        { error: "Packaging template not found" },
        { status: 404 }
      )
    }

    // Use the shanjianId as the styleId for Shanjian API calls
    resolvedStyleId = packagingTemplate.shanjianId
  } else if (resolvedStyleId) {
    const linkedPackagingTemplate = await prisma.videoPackagingTemplate.findUnique({
      where: { shanjianId: resolvedStyleId },
      select: { id: true },
    })
    resolvedPackagingTemplateId = linkedPackagingTemplate?.id ?? null
  }

  if (!resolvedStyleId) {
    return NextResponse.json(
      { error: "Unable to resolve styleId from selected template configuration" },
      { status: 400 }
    )
  }

  // Validate structureId if provided — resolve name to real id for FK
  let resolvedStructureId: string | null = null
  if (structureId) {
    const structure = await prisma.videoStructure.findFirst({
      where: {
        OR: [{ id: structureId }, { name: structureId }],
        status: "published",
      },
      select: { id: true },
    })

    if (!structure) {
      return NextResponse.json(
        { error: "Structure not found" },
        { status: 404 }
      )
    }
    resolvedStructureId = structure.id
  }

  let normalizedMaterials = materials ?? null
  let normalizedBackgroundMusic = backgroundMusic ?? null

  try {
    const normalized = await normalizePackagingInputs({
      userId: user.id,
      materials: materials ?? null,
      backgroundMusic: backgroundMusic ?? null,
    })
    normalizedMaterials = normalized.materials
    normalizedBackgroundMusic = normalized.backgroundMusic
  } catch (error) {
    if (error instanceof PackagingInputError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          field: error.field ?? null,
        },
        { status: error.status }
      )
    }
    throw error
  }

  const plan = await prisma.videoProductionPlan.create({
    data: {
      userId: user.id,
      scriptId,
      packagingTemplateId: resolvedPackagingTemplateId,
      structureId: resolvedStructureId,
      styleId: resolvedStyleId,
      materials: normalizedMaterials ?? null,
      backgroundMusic: normalizedBackgroundMusic ?? null,
      packRules: (resolvedPackRules as Prisma.InputJsonValue | null) ?? undefined,
      processRules: (resolvedProcessRules as Prisma.InputJsonValue | null) ?? undefined,
      recommendationContext:
        (recommendationContext as Prisma.InputJsonValue | null) ?? undefined,
      videoType: resolvedVideoType,
      status: "draft",
    },
  })

  return NextResponse.json({ data: plan }, { status: 201 })
})

// ─── GET /api/production-plans ────────────────────────

export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10)

  const where: { userId: string; status?: string } = { userId: user.id }
  if (status) where.status = status

  const [results, total] = await Promise.all([
    prisma.videoProductionPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        structure: {
          select: { id: true, name: true, displayName: true },
        },
        packagingTemplate: {
          select: { id: true, name: true, coverUrl: true, shanjianId: true },
        },
      },
    }),
    prisma.videoProductionPlan.count({ where }),
  ])

  return NextResponse.json({ data: { results: signOssUrls(results), total, page, pageSize } })
})
