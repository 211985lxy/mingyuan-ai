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

export function clearSessionCookie(response: NextResponse, kind: SessionKind): void {
  response.cookies.set(SESSION_CONFIG[kind].cookie, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

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
