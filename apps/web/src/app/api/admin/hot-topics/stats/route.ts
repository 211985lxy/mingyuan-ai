import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async () => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [success24h, failed24h, success7d, failed7d] = await Promise.all([
    prisma.douyinHotSnapshot.count({
      where: { fetchedAt: { gte: oneDayAgo }, status: "success" },
    }),
    prisma.douyinHotSnapshot.count({
      where: { fetchedAt: { gte: oneDayAgo }, status: "failed" },
    }),
    prisma.douyinHotSnapshot.count({
      where: { fetchedAt: { gte: sevenDaysAgo }, status: "success" },
    }),
    prisma.douyinHotSnapshot.count({
      where: { fetchedAt: { gte: sevenDaysAgo }, status: "failed" },
    }),
  ])

  return NextResponse.json({
    data: {
      last24h: { success: success24h, failed: failed24h },
      last7d: { success: success7d, failed: failed7d },
    },
  })
})
