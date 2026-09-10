import { randomBytes } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { buildFeishuKnowledgeAuthorizeUrl, resolveFeishuKnowledgeOAuthRedirectUri } from "@/lib/integrations/feishu-knowledge-auth"

export const runtime = "nodejs"

const STATE_COOKIE = "feishu_knowledge_oauth_state"
const COOKIE_MAX_AGE = 10 * 60

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)
  } catch (err) {
    return authErrorResponse(err)
  }

  const appId = env.FEISHU_APP_ID?.trim() ?? ""
  if (!appId) {
    return NextResponse.json(
      { error: "未配置 FEISHU_APP_ID，无法发起飞书知识授权。" },
      { status: 503 },
    )
  }

  const state = randomBytes(16).toString("hex")
  const redirectUri = resolveFeishuKnowledgeOAuthRedirectUri(
    request.nextUrl.origin,
    env.FEISHU_KNOWLEDGE_OAUTH_REDIRECT_URI,
  )
  const authUrl = buildFeishuKnowledgeAuthorizeUrl({ appId, redirectUri, state })
  const response = NextResponse.redirect(authUrl, { status: 302 })
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  })
  return response
}
