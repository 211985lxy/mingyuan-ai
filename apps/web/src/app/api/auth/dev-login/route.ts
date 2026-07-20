import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import { buildAuthUserPayload } from "@/lib/auth-user"
import { isCsrfSafe, setSessionCookie } from "@/lib/auth-session"
import { signUserToken } from "@/lib/user-auth"

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  if (
    env.NODE_ENV !== "development"
    || env.LOCAL_DEV_LOGIN_ENABLED !== "true"
    || !LOCAL_HOSTNAMES.has(request.nextUrl.hostname)
    || !isCsrfSafe(request, "cookie")
  ) {
    return unavailable()
  }

  const email = env.LOCAL_DEV_LOGIN_EMAIL?.trim()
  if (!email) {
    return NextResponse.json(
      { error: "本地一键登录未配置 LOCAL_DEV_LOGIN_EMAIL", code: "LOCAL_DEV_LOGIN_NOT_CONFIGURED" },
      { status: 503 },
    )
  }

  let user
  try {
    user = await prisma.user.findUnique({ where: { email } })
  } catch (error) {
    console.error("[auth/dev-login] local account lookup failed", error)
    return NextResponse.json(
      { error: "本地一键登录暂时不可用", code: "LOCAL_DEV_LOGIN_UNAVAILABLE" },
      { status: 503 },
    )
  }

  if (!user) {
    return NextResponse.json(
      { error: "本地一键登录账号不存在，请检查 LOCAL_DEV_LOGIN_EMAIL", code: "LOCAL_DEV_USER_NOT_FOUND" },
      { status: 503 },
    )
  }

  const token = signUserToken({ id: user.id, email: user.email })
  const response = NextResponse.json({ user: buildAuthUserPayload(user) })
  setSessionCookie(response, "user", token)
  return response
}
