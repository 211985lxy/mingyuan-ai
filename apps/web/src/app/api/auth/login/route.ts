import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, signUserToken } from "@/lib/user-auth"
import { buildAuthUserPayload } from "@/lib/auth-user"
import { loginBodySchema } from "@/features/auth/contracts"
import { allowAuthAttempt } from "@/features/auth/auth-rate-limit"
import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { setSessionCookie } from "@/lib/auth-session"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  let credentials
  try {
    credentials = await parseJsonBody(request, loginBodySchema, { maxBytes: 4096 })
  } catch (error) {
    return apiRequestErrorResponse(request, error) ?? NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
  const { email, password } = credentials

  if (!await allowAuthAttempt("user-login", request, email, { limit: 8, windowSeconds: 15 * 60 })) {
    return NextResponse.json(
      { error: "Too many login attempts", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "900" } },
    )
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    )
  }

  const valid = await verifyPassword(password, user.password)
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    )
  }

  const token = signUserToken({ id: user.id, email: user.email })

  const response = NextResponse.json({
    user: buildAuthUserPayload(user),
  })
  setSessionCookie(response, "user", token)
  return response
}
