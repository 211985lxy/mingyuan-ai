import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { buildAuthUserPayload } from "@/lib/auth-user"

const DAILY_LIMIT = 2

export const GET = withUserAuth(async (_request, { user }) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      authVideoUrl: true,
      createdAt: true,
      expiresAt: true,
    },
  })

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Count videos created today
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const videosCreatedToday = await prisma.videoTask.count({
    where: { userId: user.id, createdAt: { gte: todayStart } },
  })

  return NextResponse.json({
    user: buildAuthUserPayload(dbUser, {
      dailyLimit: DAILY_LIMIT,
      videosCreatedToday,
    }),
  })
}, { requireActivation: false })
