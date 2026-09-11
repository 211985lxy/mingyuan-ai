import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { consumeFeishuOAuthState, exchangeFeishuAuthorizationCode, resolveFeishuKnowledgeOAuthRedirectUri } from "@/lib/integrations/feishu-knowledge-auth"
import { toEncryptedOperatorRecord } from "@/lib/integrations/feishu-knowledge-credentials"
import { createPrismaFeishuOperatorCredentialStore } from "@/lib/integrations/feishu-knowledge-credential-store"

export const runtime = "nodejs"

const STATE_COOKIE = "feishu_knowledge_oauth_state"

export async function GET(request: NextRequest) {
  let user
  try {
    user = await authenticateRequest(request)
  } catch (err) {
    return authErrorResponse(err)
  }

  const origin = request.nextUrl.origin
  const aim = new URL("/aim", origin)
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const savedState = request.cookies.get(STATE_COOKIE)?.value

  if (!code || !consumeFeishuOAuthState({ userId: user.id, incoming: state, cookieState: savedState })) {
    aim.searchParams.set("feishu_knowledge_error", "授权状态校验失败，请重新发起飞书知识授权。")
    return clearState(NextResponse.redirect(aim, { status: 302 }))
  }

  const appId = env.FEISHU_APP_ID?.trim() ?? ""
  const appSecret = env.FEISHU_APP_SECRET?.trim() ?? ""
  const encryptionKey = env.FEISHU_TOKEN_ENCRYPTION_KEY?.trim() ?? ""
  if (!appId || !appSecret || !encryptionKey) {
    aim.searchParams.set("feishu_knowledge_error", "缺少 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_TOKEN_ENCRYPTION_KEY。")
    return clearState(NextResponse.redirect(aim, { status: 302 }))
  }

  try {
    const tokens = await exchangeFeishuAuthorizationCode({
      appId,
      appSecret,
      code,
      redirectUri: resolveFeishuKnowledgeOAuthRedirectUri(origin, env.FEISHU_KNOWLEDGE_OAUTH_REDIRECT_URI),
    })
    await createPrismaFeishuOperatorCredentialStore().save(toEncryptedOperatorRecord(tokens, encryptionKey))
    aim.searchParams.set("feishu_knowledge", "connected")
    return clearState(NextResponse.redirect(aim, { status: 302 }))
  } catch {
    aim.searchParams.set("feishu_knowledge_error", "飞书知识授权失败，请重新发起授权。")
    return clearState(NextResponse.redirect(aim, { status: 302 }))
  }
}

function clearState(response: NextResponse) {
  response.cookies.delete(STATE_COOKIE)
  return response
}
