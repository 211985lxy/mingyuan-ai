import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { buildAuthUserPayload } from "@/lib/auth-user"
import { getActivationStartDate } from "@/lib/subscription"

const DAILY_LIMIT = 2

function normalizeActivationCode(value: unknown): string {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
}

export const POST = withUserAuth(async (request: NextRequest, { user }) => {
  const body = await request.json().catch(() => ({}))
  const code = normalizeActivationCode(body.code)

  if (!code) {
    return NextResponse.json(
      { error: "Activation code is required" },
      { status: 400 }
    )
  }

  const now = new Date()

  try {
    const activatedUser = await prisma.$transaction(async (tx) => {
      const activationCode = await tx.activationCode.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          status: true,
          usedBy: true,
          durationDays: true,
        },
      })

      if (!activationCode) {
        throw new Error("ACTIVATION_CODE_NOT_FOUND")
      }

      if (activationCode.status !== "unused") {
        throw new Error("ACTIVATION_CODE_ALREADY_USED")
      }

      const dbUser = await tx.user.findUnique({
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
        throw new Error("USER_NOT_FOUND")
      }

      const activationStart = getActivationStartDate(dbUser.expiresAt, now)
      const nextExpiresAt = new Date(activationStart)
      nextExpiresAt.setDate(nextExpiresAt.getDate() + activationCode.durationDays)

      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: { expiresAt: nextExpiresAt },
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

      await tx.activationCode.update({
        where: { id: activationCode.id },
        data: {
          status: "used",
          usedBy: user.id,
          usedAt: now,
        },
      })

      return updatedUser
    })

    return NextResponse.json({
      user: buildAuthUserPayload(activatedUser, {
        dailyLimit: DAILY_LIMIT,
      }),
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ACTIVATION_CODE_NOT_FOUND") {
        return NextResponse.json(
          { error: "Activation code not found" },
          { status: 404 }
        )
      }

      if (error.message === "ACTIVATION_CODE_ALREADY_USED") {
        return NextResponse.json(
          { error: "Activation code already used" },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { error: "Activation failed, please try again" },
      { status: 500 }
    )
  }
}, { requireActivation: false })
