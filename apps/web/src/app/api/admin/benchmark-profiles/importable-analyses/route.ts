import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

// GET — 列出已完成的竞品分析，供「一键拉取」选择。
// admin 视角跨用户可见全部已完成分析（标注所属用户便于辨认）。
export const GET = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const platform = searchParams.get("platform") ?? ""

  const where: Record<string, unknown> = { status: "completed" }
  if (platform) where.platform = platform

  const analyses = await prisma.competitorAnalysis.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      targetUrl: true,
      platform: true,
      accountName: true,
      overallScore: true,
      status: true,
      createdAt: true,
      userId: true,
    },
  })

  // 关联用户邮箱便于在后台辨认归属
  const userIds = [...new Set(analyses.map((a) => a.userId))]
  const users = userIds.length
      ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
        take: 50,
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const data = analyses.map((a) => ({
    ...a,
    user: userMap.get(a.userId)
      ? { email: userMap.get(a.userId)!.email, name: userMap.get(a.userId)!.name }
      : null,
  }))

  return NextResponse.json({ data })
})
