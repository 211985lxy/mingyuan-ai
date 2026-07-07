import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"

// POST — Create template
export const POST = withAdminAuth(async (request, { admin }) => {
  const body = await request.json()
  const {
    name, displayName, description, scriptTemplate, variables,
    expressionBlueprint,
    hookType, shanjianStyleId, videoType, packRulesJson, processRulesJson,
    industry, contentType, tags, hotTopicKeywords, seasonalEvents,
  } = body

  if (!name || !displayName || !scriptTemplate || !contentType) {
    return NextResponse.json(
      { error: "name, displayName, scriptTemplate, contentType are required" },
      { status: 400 }
    )
  }

  const template = await prisma.contentTemplate.create({
    data: {
      name,
      displayName,
      description: description ?? null,
      scriptTemplate,
      expressionBlueprint: expressionBlueprint ?? Prisma.DbNull,
      variables: variables ?? [],
      hookType: hookType ?? null,
      shanjianStyleId: shanjianStyleId ?? null,
      videoType: videoType ?? "virtualman_broadcast",
      packRulesJson: packRulesJson ?? Prisma.DbNull,
      processRulesJson: processRulesJson ?? Prisma.DbNull,
      industry: industry ?? [],
      contentType,
      tags: tags ?? [],
      hotTopicKeywords: hotTopicKeywords ?? [],
      seasonalEvents: seasonalEvents ?? [],
      createdBy: admin.id,
    },
  })

  return NextResponse.json({ data: template }, { status: 201 })
})

// GET — List templates (all statuses)
export const GET = withAdminAuth(async (request) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")
  const contentType = searchParams.get("contentType")
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10)

  const where: Record<string, unknown> = {}
  if (status) where.status = status
  if (contentType) where.contentType = contentType

  const [templates, total] = await Promise.all([
    prisma.contentTemplate.findMany({
      where,
      orderBy: [{ status: "asc" }, { sortOrder: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contentTemplate.count({ where }),
  ])

  return NextResponse.json({
    data: { results: templates, total, page, pageSize },
  })
})
