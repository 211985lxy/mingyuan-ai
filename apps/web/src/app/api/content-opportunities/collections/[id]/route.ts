import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/content-opportunities/collections/[id]
 * 获取研究篮详情（含分析结果）
 */
export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = params!.id

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id },
  })

  if (!collection) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  return NextResponse.json(collection)
})

/**
 * DELETE /api/content-opportunities/collections/[id]
 */
export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = params!.id

  const result = await prisma.opportunityCollection.deleteMany({
    where: { id, userId: user.id },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
})
