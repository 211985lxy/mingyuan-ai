import { env } from "@/env"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "./prisma"
import type { AdminRole } from "@/types/content-template"
import { isCsrfSafe, readSessionToken } from "@/lib/auth-session"
import { apiRequestErrorResponse } from "@/lib/api-contract"
import { createRequestLogger, generateRequestId, hashLogIdentifier } from "@/lib/logger"

const ADMIN_JWT_SECRET = env.ADMIN_JWT_SECRET

function requireAdminJwtSecret(): string {
  if (!ADMIN_JWT_SECRET || ADMIN_JWT_SECRET.length < 32) {
    throw new Error(
      "ADMIN_JWT_SECRET 未配置或长度不足(需 ≥32 字符)。请在环境变量中配置。"
    )
  }
  return ADMIN_JWT_SECRET
}

interface AdminPayload {
  id: string
  email: string
  role: AdminRole
  sessionVersion: number
}

/**
 * @description 使用 bcrypt 对密码进行哈希加密
 * @param password - 原始密码
 * @returns 哈希后的密码字符串
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

/**
 * @description 验证密码是否与哈希匹配
 * @param password - 原始密码
 * @param hash - 哈希值
 * @returns 匹配返回 true
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * @description 签发管理员 JWT 令牌（有效期 8 小时）
 * @param payload - 管理员载荷（ID、邮箱、角色、会话版本）
 * @returns JWT 令牌字符串
 */
export function signAdminToken(payload: AdminPayload): string {
  return jwt.sign(payload, requireAdminJwtSecret(), { expiresIn: "8h" })
}

/**
 * @description 验证并解析管理员 JWT 令牌
 * @param token - JWT 令牌字符串
 * @returns 解析后的管理员载荷，无效时返回 null
 */
export function verifyAdminToken(token: string): AdminPayload | null {
  const secret = requireAdminJwtSecret()
  try {
    return jwt.verify(token, secret) as AdminPayload
  } catch {
    return null
  }
}

/**
 * Admin auth middleware wrapper.
 * Validates admin JWT and optionally checks role.
 */
/**
 * @description withadminauth
 * @param handler - 处理函数
 * @returns 无返回值
 */
export function withAdminAuth(
  handler: (
    request: NextRequest,
    context: { admin: AdminPayload; params?: Record<string, string> }
  ) => Promise<NextResponse>,
  requiredRole?: AdminRole
) {
  return async (
    request: NextRequest,
    segmentData: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const requestId = request.headers.get("x-request-id") || generateRequestId()
    const session = readSessionToken(request, "admin")
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!isCsrfSafe(request, session.source)) {
      return NextResponse.json(
        { error: "Cross-site request rejected", code: "CSRF_REJECTED" },
        { status: 403 },
      )
    }

    const admin = verifyAdminToken(session.token)
    if (!admin) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Check if admin is still active
    const dbAdmin = await prisma.adminUser.findUnique({
      where: { id: admin.id },
    })
    if (
      !dbAdmin ||
      !dbAdmin.isActive ||
      dbAdmin.sessionVersion !== admin.sessionVersion
    ) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 })
    }

    // Role check: admin has all permissions, editor is restricted
    if (requiredRole === "admin" && admin.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const params = segmentData ? await segmentData.params : undefined
    const log = createRequestLogger({
      requestId,
      userIdHash: hashLogIdentifier(admin.id),
      path: request.nextUrl.pathname,
    })
    try {
      const response = await handler(request, { admin, params })
      response.headers.set("x-request-id", requestId)
      return response
    } catch (error) {
      const contractResponse = apiRequestErrorResponse(request, error)
      if (contractResponse) return contractResponse
      log.error({ err: error }, "admin request failed")
      throw error
    }
  }
}

/**
 * Validate CRON_SECRET for cron endpoint protection.
 */
/**
 * @description 验证cronsecret
 * @param request - 请求对象
 * @returns boolean
 */
export function validateCronSecret(request: NextRequest): boolean {
  const auth = request.headers.get("authorization")
  const cronSecret = env.CRON_SECRET
  if (!cronSecret) return false
  return auth === `Bearer ${cronSecret}`
}
