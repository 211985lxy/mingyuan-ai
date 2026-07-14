import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { buildAuthUserPayload } from "@/lib/auth-user"

export const GET = withUserAuth(async (_request, { user }) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      createdAt: true,
      expiresAt: true,
    },
  })

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({
    user: buildAuthUserPayload(dbUser),
  })
}, { requireActivation: false })
