import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { resolveBoundProject } from "@/lib/account-project-context"

/**
 * GET /api/content-opportunities/collections/[id]
 * 获取研究篮详情（含分析结果）
 */
export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少研究篮 ID" }, { status: 400 })
  }

  const project = await resolveBoundProject({ userId: user.id })

  const collection = await prisma.opportunityCollection.findFirst({
    where: { id, userId: user.id, projectId: project.id },
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
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少研究篮 ID" }, { status: 400 })
  }

  const project = await resolveBoundProject({ userId: user.id })

  const result = await prisma.opportunityCollection.deleteMany({
    where: { id, userId: user.id, projectId: project.id },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: "研究篮不存在" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
})
