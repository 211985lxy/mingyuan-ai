import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminOrEditor(async (request) => {
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20))

  const [snapshots, total] = await Promise.all([
    prisma.douyinHotSnapshot.findMany({
      orderBy: { fetchedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.douyinHotSnapshot.count(),
  ])

  return NextResponse.json({
    data: { results: snapshots, total, page, pageSize },
  })
})
