import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword, signUserToken } from "@/lib/user-auth"
import { buildAuthUserPayload } from "@/lib/auth-user"

const DAILY_LIMIT = 2

export async function POST(request: NextRequest) {
  const { email, password, name } = await request.json()

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Email, password, and name are required" },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 }
    )
  }

  const hash = await hashPassword(password)
  const user = await prisma.user.create({
    data: { email, password: hash, name },
  })

  const token = signUserToken({ id: user.id, email: user.email })

  return NextResponse.json(
    {
      token,
      user: buildAuthUserPayload(user, {
        dailyLimit: DAILY_LIMIT,
        videosCreatedToday: 0,
      }),
    },
    { status: 201 }
  )
}
