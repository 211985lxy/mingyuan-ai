import { env } from "@/env"
import type { NextRequest, NextResponse } from "next/server"

export type SessionKind = "user" | "admin"
export type SessionTokenSource = "bearer" | "cookie"

const SESSION_CONFIG = {
  user: { cookie: "mingyuan_user_session", maxAge: 60 * 60 * 24 * 7 },
  admin: { cookie: "mingyuan_admin_session", maxAge: 60 * 60 * 8 },
} as const

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = forwardedHost || request.headers.get("host")?.trim()
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const proto = forwardedProto || request.nextUrl.protocol.replace(/:$/, "")

  if (host && proto) {
    return `${proto}://${host}`
  }

  return request.nextUrl.origin
}

/**
 * @description 从请求中读取会话令牌（优先从 Authorization Bearer 头，其次从 Cookie）
 * @param request - Next.js 请求对象
 * @param kind - 会话类型（user 或 admin）
 * @returns 令牌及来源，未找到则返回 null
 */
export function readSessionToken(
  request: NextRequest,
  kind: SessionKind,
): { token: string; source: SessionTokenSource } | null {
  const authorization = request.headers.get("authorization")
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7).trim()
    if (token && token !== "null" && token !== "undefined") {
      return { token, source: "bearer" }
    }
  }

  const token = request.cookies.get(SESSION_CONFIG[kind].cookie)?.value
  return token ? { token, source: "cookie" } : null
}

/**
 * @description 在响应中设置会话 Cookie（httpOnly、安全传输）
 * @param response - Next.js 响应对象
 * @param kind - 会话类型（user 或 admin）
 * @param token - 会话令牌值
 */
export function setSessionCookie(
  response: NextResponse,
  kind: SessionKind,
  token: string,
): void {
  const config = SESSION_CONFIG[kind]
  response.cookies.set(config.cookie, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: config.maxAge,
  })
}

/**
 * @description 清除指定类型的会话 Cookie（通过设置 maxAge=0 使其过期）
 * @param response - Next.js 响应对象
 * @param kind - 会话类型（user 或 admin）
 */
export function clearSessionCookie(response: NextResponse, kind: SessionKind): void {
  response.cookies.set(SESSION_CONFIG[kind].cookie, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

/**
 * @description 检查请求是否通过 CSRF 安全校验（同源请求或 Bearer 令牌请求视为安全）
 * @param request - Next.js 请求对象
 * @param source - 令牌来源（bearer 或 cookie）
 * @returns 通过 CSRF 校验返回 true，否则返回 false
 */
export function isCsrfSafe(
  request: NextRequest,
  source: SessionTokenSource,
): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase()) || source === "bearer") {
    return true
  }

  const origin = request.headers.get("origin")
  if (origin) {
    try {
      return new URL(origin).origin === getRequestOrigin(request)
    } catch {
      return false
    }
  }

  return request.headers.get("sec-fetch-site") === "same-origin"
}
