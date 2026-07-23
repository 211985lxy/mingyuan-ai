import { NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { createCollectionBodySchema } from "@/features/opportunities/contracts/api"

/**
 * POST /api/content-opportunities/collections
 * 创建研究篮（保存选中的样本）
 */
export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonBody(request, createCollectionBodySchema, { maxBytes: 32 * 1024 })

  const collection = await prisma.opportunityCollection.create({
    data: {
      userId: user.id,
      projectId: body.projectId || null,
      name: body.name,
      items: body.items as unknown as object[],
      status: "draft",
    },
  })

  return NextResponse.json({ id: collection.id, name: collection.name, status: collection.status }, { status: 201 })
})

/**
 * GET /api/content-opportunities/collections
 * 列出用户的研究篮
 */
export const GET = withUserAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") || undefined
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 50)

  const collections = await prisma.opportunityCollection.findMany({
    where: {
      userId: user.id,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      status: true,
      projectId: true,
      analysisError: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { id: true } },
    },
  })

  return NextResponse.json({ collections })
})
