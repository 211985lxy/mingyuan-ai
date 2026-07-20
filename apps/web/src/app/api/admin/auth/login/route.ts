import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, signAdminToken } from "@/lib/admin-auth"
import type { AdminRole } from "@/types/content-template"
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

  if (!await allowAuthAttempt("admin-login", request, email, { limit: 5, windowSeconds: 15 * 60 })) {
    return NextResponse.json(
      { error: "Too many login attempts", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "900" } },
    )
  }

  const admin = await prisma.adminUser.findUnique({ where: { email } })
  if (!admin || !admin.isActive) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    )
  }

  const valid = await verifyPassword(password, admin.password)
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    )
  }

  const token = signAdminToken({
    id: admin.id,
    email: admin.email,
    role: admin.role as AdminRole,
    sessionVersion: admin.sessionVersion,
  })

  const response = NextResponse.json({
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  })
  setSessionCookie(response, "admin", token)
  return response
}
