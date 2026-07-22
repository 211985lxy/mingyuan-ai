import { NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { createCollectionBodySchema } from "@/features/opportunities/contracts/api"

/**
 * POST /api/content-opportunities/collections
 * 保存研究篮（用户选中的 5-10 条内容）
 */
export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, createCollectionBodySchema, { maxBytes: 32 * 1024 })

  const collection = await prisma.opportunityCollection.create({
    data: {
      userId: user.id,
      projectId: body.projectId || null,
      searchRunId: body.searchRunId || null,
      name: body.name || null,
      itemIds: body.items.map((_, i) => `item_${i}`),
      items: body.items as unknown as object[],
      status: "draft",
    },
  })

  return NextResponse.json({ id: collection.id, status: collection.status }, { status: 201 })
})

/**
 * GET /api/content-opportunities/collections
 * 列出当前用户的研究篮
 */
export const GET = withUserAuth(async (request, { user }) => {
  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") || undefined

  const collections = await prisma.opportunityCollection.findMany({
    where: {
      userId: user.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      projectId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { id: true } },
    },
  })

  return NextResponse.json({ collections })
})
