import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword, signUserToken } from "@/lib/user-auth"
import { buildAuthUserPayload } from "@/lib/auth-user"
import { registerBodySchema } from "@/features/auth/contracts"
import { allowAuthAttempt } from "@/features/auth/auth-rate-limit"
import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { setSessionCookie } from "@/lib/auth-session"

export async function POST(request: NextRequest) {
  let input
  try {
    input = await parseJsonBody(request, registerBodySchema, { maxBytes: 4096 })
  } catch (error) {
    return apiRequestErrorResponse(request, error) ?? NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const { email, password, name } = input

  if (!await allowAuthAttempt("user-register", request, email, { limit: 5, windowSeconds: 60 * 60 })) {
    return NextResponse.json(
      { error: "Too many registration attempts", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "3600" } },
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

  const response = NextResponse.json(
    {
      user: buildAuthUserPayload(user),
    },
    { status: 201 }
  )
  setSessionCookie(response, "user", token)
  return response
}
