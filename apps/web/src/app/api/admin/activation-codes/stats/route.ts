import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async () => {
  const [total, used] = await Promise.all([
    prisma.activationCode.count(),
    prisma.activationCode.count({ where: { status: "used" } }),
  ])

  const unused = total - used
  const usageRate = total > 0 ? Math.round((used / total) * 10000) / 100 : 0

  return NextResponse.json({
    data: { total, unused, used, usageRate },
  })
})
