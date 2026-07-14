import { env } from "@/env"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "./prisma"
import { getSubscriptionStatus } from "@/lib/subscription"
import { isCsrfSafe, readSessionToken } from "@/lib/auth-session"

const JWT_SECRET = env.JWT_SECRET

/**
 * 强制要求 JWT_SECRET 已配置且足够强。
 * 删除硬编码 fallback:生产漏配会导致任意 token 可被伪造,必须 fail-fast。
 * 在 try-catch 之外调用,缺失时让异常穿透到 route 的错误处理(返回 500 + 日志),
 * 而不是被 verify 的 catch 吞成静默 401。
 */
function requireJwtSecret(): string {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET 未配置或长度不足(需 ≥32 字符)。请在 .env.local / 生产环境变量中配置强随机串。"
    )
  }
  return JWT_SECRET
}

interface UserPayload {
  id: string
  email: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signUserToken(payload: UserPayload): string {
  return jwt.sign(payload, requireJwtSecret(), { expiresIn: "7d" })
}

export function verifyUserToken(token: string): UserPayload | null {
  const secret = requireJwtSecret()
  try {
    return jwt.verify(token, secret) as UserPayload
  } catch {
    return null
  }
}

export async function authenticateRequest(
  request: NextRequest,
  options: { requireActivation?: boolean } = {}
): Promise<UserPayload> {
  const session = readSessionToken(request, "user")
  if (!session) {
    throw new Error("UNAUTHORIZED")
  }
  if (!isCsrfSafe(request, session.source)) throw new Error("CSRF_REJECTED")

  const user = verifyUserToken(session.token)
  if (!user) {
    throw new Error("INVALID_TOKEN")
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  })
  if (!dbUser) {
    throw new Error("USER_NOT_FOUND")
  }

  if (options.requireActivation !== false) {
    const subscriptionStatus = getSubscriptionStatus(dbUser.expiresAt)
    if (subscriptionStatus !== "active") {
      throw new Error(
        subscriptionStatus === "expired"
          ? "SUBSCRIPTION_EXPIRED"
          : "ACTIVATION_REQUIRED"
      )
    }
  }

  return user
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null

  if (error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (error.message === "INVALID_TOKEN") {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }
  if (error.message === "USER_NOT_FOUND") {
    return NextResponse.json({ error: "User not found" }, { status: 401 })
  }
  if (error.message === "ACTIVATION_REQUIRED") {
    return NextResponse.json(
      { error: "Activation required", code: "ACTIVATION_REQUIRED" },
      { status: 403 }
    )
  }
  if (error.message === "SUBSCRIPTION_EXPIRED") {
    return NextResponse.json(
      { error: "Subscription expired", code: "SUBSCRIPTION_EXPIRED" },
      { status: 403 }
    )
  }
  if (error.message === "CSRF_REJECTED") {
    return NextResponse.json(
      { error: "Cross-site request rejected", code: "CSRF_REJECTED" },
      { status: 403 },
    )
  }

  return null
}

/**
 * User auth middleware wrapper.
 * Validates user JWT and injects user context into handler.
 */
export function withUserAuth(
  handler: (
    request: NextRequest,
    context: { user: UserPayload; params?: Record<string, string> }
  ) => Promise<NextResponse>,
  options: { requireActivation?: boolean } = {}
) {
  return async (
    request: NextRequest,
    segmentData: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const session = readSessionToken(request, "user")
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isCsrfSafe(request, session.source)) {
      return NextResponse.json(
        { error: "Cross-site request rejected", code: "CSRF_REJECTED" },
        { status: 403 },
      )
    }

    const user = verifyUserToken(session.token)
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Check if user still exists
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    })
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 401 })
    }

    if (options.requireActivation !== false) {
      const subscriptionStatus = getSubscriptionStatus(dbUser.expiresAt)

      if (subscriptionStatus !== "active") {
        return NextResponse.json(
          {
            error:
              subscriptionStatus === "expired"
                ? "Subscription expired"
                : "Activation required",
            code:
              subscriptionStatus === "expired"
                ? "SUBSCRIPTION_EXPIRED"
                : "ACTIVATION_REQUIRED",
          },
          { status: 403 }
        )
      }
    }

    const params = segmentData ? await segmentData.params : undefined
    return handler(request, { user, params })
  }
}
