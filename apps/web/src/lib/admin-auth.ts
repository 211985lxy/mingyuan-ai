import { env } from "@/env"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "./prisma"
import type { AdminRole } from "@/types/content-template"
import { isCsrfSafe, readSessionToken } from "@/lib/auth-session"
import { apiRequestErrorResponse } from "@/lib/api-contract"
import { createRequestLogger, generateRequestId, hashLogIdentifier } from "@/lib/logger"
import { safeSecretEqual } from "@/lib/aim/work-item-api-auth"

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

type AdminRouteHandler = (
  request: NextRequest,
  context: { admin: AdminPayload; params?: Record<string, string> }
) => Promise<NextResponse>

/**
 * @description 使用 bcrypt 对密码进行哈希加密
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

/**
 * @description 验证密码是否与哈希匹配
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * @description 签发管理员 JWT 令牌（有效期 8 小时）
 */
export function signAdminToken(payload: AdminPayload): string {
  return jwt.sign(payload, requireAdminJwtSecret(), { expiresIn: "8h" })
}

/**
 * @description 验证并解析管理员 JWT 令牌
 */
export function verifyAdminToken(token: string): AdminPayload | null {
  const secret = requireAdminJwtSecret()
  try {
    return jwt.verify(token, secret) as AdminPayload
  } catch {
    return null
  }
}

function createAdminAuthWrapper(
  handler: AdminRouteHandler,
  allowedRoles: readonly AdminRole[],
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

    if (!allowedRoles.includes(admin.role)) {
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
 * 仅管理员可访问。敏感接口（激活码、AIM 快照、用户、审计等）必须用这个。
 */
export function withAdminOnly(handler: AdminRouteHandler) {
  return createAdminAuthWrapper(handler, ["admin"] as const)
}

/**
 * 管理员或编辑员可访问。内容运营（模板、知识库、方法论、对标）用这个。
 */
export function withAdminOrEditor(handler: AdminRouteHandler) {
  return createAdminAuthWrapper(handler, ["admin", "editor"] as const)
}

/**
 * Validate CRON_SECRET for cron endpoint protection.
 */
export function validateCronSecret(request: NextRequest): boolean {
  const auth = request.headers.get("authorization")
  const cronSecret = env.CRON_SECRET
  if (!cronSecret) return false
  return safeSecretEqual(`Bearer ${cronSecret}`, auth ?? "")
}
