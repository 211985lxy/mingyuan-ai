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

  let existing
  try {
    existing = await prisma.user.findUnique({ where: { email } })
  } catch (error) {
    console.error("[auth/register] account lookup failed", error)
    return NextResponse.json({ error: "注册服务暂时不可用，请稍后再试" }, { status: 503 })
  }
  if (existing) {
    return NextResponse.json(
      { error: "该邮箱已注册，请直接登录" },
      { status: 409 }
    )
  }

  // 数据库查询成功后才消耗注册额度，避免服务器 500 反过来误封用户。
  if (!await allowAuthAttempt("user-register", request, email, { limit: 5, windowSeconds: 60 * 60 })) {
    return NextResponse.json(
      { error: "注册操作过于频繁，请一小时后再试", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "3600" } },
    )
  }

  let user
  try {
    const hash = await hashPassword(password)
    user = await prisma.user.create({ data: { email, password: hash, name } })
  } catch (error) {
    console.error("[auth/register] account creation failed", error)
    return NextResponse.json({ error: "注册服务暂时不可用，请稍后再试" }, { status: 503 })
  }

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
