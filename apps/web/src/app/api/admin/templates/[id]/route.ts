import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import { invalidateTemplateCache } from "@/lib/template-state"

// GET — Template detail
export const GET = withAdminAuth(async (_request, { params }) => {
  const template = await prisma.contentTemplate.findUnique({
    where: { id: params?.id },
  })
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json({ data: template })
})

// PUT — Edit template
export const PUT = withAdminAuth(async (request, { params }) => {
  const body = await parseJsonRecord(request)
  const template = await prisma.contentTemplate.findUnique({
    where: { id: params?.id },
  })
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const updated = await prisma.contentTemplate.update({
    where: { id: params?.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.displayName !== undefined && { displayName: body.displayName }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.scriptTemplate !== undefined && { scriptTemplate: body.scriptTemplate }),
      ...(body.expressionBlueprint !== undefined && {
        expressionBlueprint: body.expressionBlueprint ?? Prisma.DbNull,
      }),
      ...(body.variables !== undefined && { variables: body.variables }),
      ...(body.hookType !== undefined && { hookType: body.hookType }),
      ...(body.industry !== undefined && { industry: body.industry }),
      ...(body.contentType !== undefined && { contentType: body.contentType }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.hotTopicKeywords !== undefined && { hotTopicKeywords: body.hotTopicKeywords }),
      ...(body.seasonalEvents !== undefined && { seasonalEvents: body.seasonalEvents }),
    },
  })
  if (template.status === "published") {
    await invalidateTemplateCache()
  }
  return NextResponse.json({ data: updated })
})

// DELETE — Delete template (admin only)
export const DELETE = withAdminAuth(async (_request, { params }) => {
  const template = await prisma.contentTemplate.findUnique({
    where: { id: params?.id },
  })
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (template.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft templates can be deleted" },
      { status: 422 }
    )
  }
  await prisma.contentTemplate.delete({ where: { id: params?.id } })
  return NextResponse.json({ data: { deleted: true } })
}, "admin")
