import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async (request) => {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10)

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
