import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    videosToday,
    activeTemplates,
    recentFetchSuccess,
    recentFetchFailed,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.videoTask.count({ where: { createdAt: { gte: today } } }),
    prisma.contentTemplate.count({ where: { status: "published" } }),
    prisma.douyinHotSnapshot.count({
      where: { fetchedAt: { gte: oneDayAgo }, status: "success" },
    }),
    prisma.douyinHotSnapshot.count({
      where: { fetchedAt: { gte: oneDayAgo }, status: "failed" },
    }),
  ])

  return NextResponse.json({
    data: {
      totalUsers,
      videosToday,
      activeTemplates,
      hotListHealth: {
        successLast24h: recentFetchSuccess,
        failedLast24h: recentFetchFailed,
      },
    },
  })
})
