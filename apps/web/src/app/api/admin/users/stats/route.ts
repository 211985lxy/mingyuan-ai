import { NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminOnly(async () => {
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const [total, byPlanRaw, newThisWeek] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({
      by: ["plan"],
      _count: { plan: true },
    }),
    prisma.user.count({
      where: { createdAt: { gte: oneWeekAgo } },
    }),
  ])

  const byPlan = byPlanRaw.map((row) => ({
    plan: row.plan,
    count: row._count.plan,
  }))

  return NextResponse.json({
    data: { total, byPlan, newThisWeek },
  })
})
