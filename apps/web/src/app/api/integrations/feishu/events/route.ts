import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { env } from "@/env"
import { NextResponse } from "next/server"

import {
  buildFeishuTextReply,
  getFeishuTenantAccessToken,
  parseFeishuMessageEvent,
  replyFeishuTextMessage,
  verifyFeishuEventToken,
} from "@/lib/integrations/feishu-topic-chat"
import { handleTopicChatMessage } from "@/lib/topic-chat-service"

export const maxDuration = 60

export async function POST(request: Request) {
  let payload: Record<string, unknown>
  try {
    payload = await parseJsonRecord(request)
  } catch (error) {
    return apiRequestErrorResponse(request, error)!
  }
  const verificationToken = env.FEISHU_VERIFICATION_TOKEN || ""

  if (!verifyFeishuEventToken(payload, verificationToken)) {
    return NextResponse.json({ error: "invalid feishu token" }, { status: 401 })
  }

  if (payload?.encrypt) {
    return NextResponse.json({ error: "encrypted feishu events are not enabled" }, { status: 400 })
  }

  if (payload?.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge })
  }

  const event = parseFeishuMessageEvent(payload)
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  const userId = env.FEISHU_TOPIC_CHAT_USER_ID || ""
  const projectId = env.FEISHU_TOPIC_CHAT_PROJECT_ID || ""
  const appId = env.FEISHU_APP_ID || ""
  const appSecret = env.FEISHU_APP_SECRET || ""
  if (!userId || !projectId || !appId || !appSecret) {
    return NextResponse.json({ error: "feishu topic chat env is not configured" }, { status: 503 })
  }

  const result = await handleTopicChatMessage({
    userId,
    projectId,
    content: event.text,
  })
  const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret })
  await replyFeishuTextMessage({
    messageId: event.messageId,
    text: buildFeishuTextReply(result),
    tenantAccessToken,
  })

  return NextResponse.json({ ok: true })
}
