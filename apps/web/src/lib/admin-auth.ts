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
import { recordAdminAudit, wasRequestAudited } from "@/lib/admin-audit"

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

async function recordAutomaticAdminAudit(input: {
  request: NextRequest
  adminId: string
  status: "success" | "failed"
  responseStatus?: number
  error?: unknown
}) {
  if (wasRequestAudited(input.request)) return
  const routeKey = input.request.nextUrl.pathname
    .replace(/^\/api\/admin\//, "")
    .replace(/[^a-zA-Z0-9_.:-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
  const method = input.request.method.toLowerCase()
  const action = `admin.route.${method}.${routeKey || "root"}`.slice(0, 100)
  const errorCode = input.error && typeof input.error === "object" && typeof (input.error as { name?: unknown }).name === "string"
    ? String((input.error as { name: string }).name).slice(0, 64)
    : undefined
  await recordAdminAudit({
    request: input.request,
    adminId: input.adminId,
    action,
    targetType: "admin_route",
    targetId: input.request.nextUrl.pathname,
    status: input.status,
    severity: input.status === "failed" || (input.responseStatus ?? 200) >= 400 ? "error" : "info",
    metadata: {
      method,
      route: input.request.nextUrl.pathname,
      status: input.responseStatus,
      errorCode,
    },
  })
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
    const mutationMethod = /^(POST|PUT|PATCH|DELETE)$/i.test(request.method)
    try {
      const response = await handler(request, { admin, params })
      if (mutationMethod) await recordAutomaticAdminAudit({ request, adminId: admin.id, status: response.status >= 400 ? "failed" : "success", responseStatus: response.status })
      response.headers.set("x-request-id", requestId)
      return response
    } catch (error) {
      try {
        if (mutationMethod) await recordAutomaticAdminAudit({ request, adminId: admin.id, status: "failed", responseStatus: 500, error })
      } catch (auditError) {
        log.error({ err: auditError }, "automatic admin audit failed")
      }
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
