import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { buildAuthUserPayload } from "@/lib/auth-user"

const DAILY_LIMIT = 2

export const POST = withUserAuth(async (request, { user }) => {
  const { authVideoUrl } = await parseJsonRecord(request)

  if (!authVideoUrl || typeof authVideoUrl !== "string") {
    return NextResponse.json(
      { error: "authVideoUrl is required" },
      { status: 400 }
    )
  }

  const updatedUser = await prisma.user.update({
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
    data: { authVideoUrl },
  })

  return NextResponse.json({
    user: buildAuthUserPayload(updatedUser, {
      dailyLimit: DAILY_LIMIT,
    }),
  })
})
