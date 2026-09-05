import { randomBytes } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { signUserToken, hashPassword } from "@/lib/user-auth"
import { buildAuthUserPayload } from "@/lib/auth-user"
import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { setSessionCookie } from "@/lib/auth-session"
import { smsLoginBodySchema } from "@/features/auth/contracts"
import { allowAuthAttempt } from "@/features/auth/auth-rate-limit"
import { consumeLoginCode } from "@/features/auth/sms-verification"

/** 手机号自动注册的占位邮箱（email 非空唯一）；展示层应过滤该域名 */
export function placeholderEmailForPhone(phone: string): string {
  return `${phone}@phone.local`
}

/**
 * POST /api/auth/sms/login — 手机号验证码登录
 * 未注册手机号验码通过后自动注册（随机不可用密码，后续可自行设置）。
 * 复用既有 user session（signUserToken + cookie），与邮箱密码登录等价。
 */
export async function POST(request: NextRequest) {
  let body
  try {
    body = await parseJsonBody(request, smsLoginBodySchema, { maxBytes: 4096 })
  } catch (error) {
    return (
      apiRequestErrorResponse(request, error) ??
      NextResponse.json({ error: "Invalid request" }, { status: 400 })
    )
  }
  const { phone, code } = body

  if (
    !await allowAuthAttempt("sms-login", request, phone, { limit: 8, windowSeconds: 15 * 60 })
  ) {
    return NextResponse.json(
      { error: "尝试次数过多，请 15 分钟后再试", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "900" } },
    )
  }

  const consumed = await consumeLoginCode(phone, code)
  if (!consumed.ok) {
    // 对外统一"验证码错误或已过期"，不泄露具体原因
    return NextResponse.json(
      { error: "验证码错误或已过期，请重新获取" },
      { status: 401 }
    )
  }

  let user = await prisma.user.findUnique({ where: { phone } })

  if (!user) {
    // 自动注册：随机密码（不可用于登录，bcrypt 加密），占位邮箱
    const randomPassword = randomBytes(24).toString("hex")
    user = await prisma.user.create({
      data: {
        phone,
        email: placeholderEmailForPhone(phone),
        password: await hashPassword(randomPassword),
        name: `用户${phone.slice(-4)}`,
      },
    })
  }

  const token = signUserToken({ id: user.id, email: user.email })
  const response = NextResponse.json({ user: buildAuthUserPayload(user) })
  setSessionCookie(response, "user", token)
  return response
}
