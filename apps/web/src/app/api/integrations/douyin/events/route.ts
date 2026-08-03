import { NextRequest, NextResponse } from "next/server"

import { env } from "@/env"
import { verifyDouyinEventSignature } from "@/lib/integrations/douyin-event-signature"

// 抖音开放平台「事件订阅 / Webhooks」被动回调端点。
// 鉴权方式：请求 Header `X-Douyin-Signature = sha1(client_secret + 原始消息体)`。
// api-inventory: auth=signed_integration

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * 抖音事件外层结构（事件订阅 / Webhooks）。
 * content 在 verify_webhook 校验请求里是对象，在业务事件里通常是 JSON 字符串，
 * 因此这里统一声明为 unknown，由 parseDouyinEventContent 在使用处做兼容解析。
 */
type DouyinEventEnvelope = {
  event?: unknown
  client_key?: unknown
  content?: unknown
  log_id?: unknown
  from_user_id?: unknown
  to_user_id?: unknown
}

/**
 * 把抖音事件的 content 字段统一解析成对象。
 * - verify_webhook 校验请求：content 本身就是对象（含 challenge）。
 * - 业务事件：content 多为序列化后的 JSON 字符串，需再 JSON.parse 一次。
 * 解析失败时返回 null，调用方按需处理。
 */
function parseDouyinEventContent(content: unknown): Record<string, unknown> | null {
  if (content && typeof content === "object") {
    return content as Record<string, unknown>
  }
  if (typeof content === "string" && content.length > 0) {
    try {
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

function safeParseEnvelope(rawBody: string): DouyinEventEnvelope | null {
  try {
    const value = JSON.parse(rawBody)
    if (value && typeof value === "object") {
      return value as DouyinEventEnvelope
    }
  } catch {
    /* 非法 JSON，交由调用方返回 400 */
  }
  return null
}

export async function POST(request: NextRequest) {
  const clientSecret = env.DOUYIN_CLIENT_SECRET
  if (!clientSecret) {
    // 未配置 client_secret 时拒绝服务并明确报错，避免用空串放行伪造请求。
    console.error("[integrations/douyin/events] DOUYIN_CLIENT_SECRET 未配置，拒绝请求")
    return NextResponse.json({ error: "抖音事件 Webhook 未配置验签密钥" }, { status: 503 })
  }

  if (env.DOUYIN_EVENT_WEBHOOK_ENABLED === "false") {
    return NextResponse.json({ error: "抖音事件 Webhook 已停用" }, { status: 503 })
  }

  // 注意：必须先用原始 body 字节验签，再 JSON.parse；切勿二次序列化。
  const rawBody = await request.text()
  const signature = request.headers.get("x-douyin-signature")
  if (!signature) {
    return NextResponse.json({ error: "缺少 X-Douyin-Signature 签名" }, { status: 401 })
  }

  if (!verifyDouyinEventSignature({ clientSecret, rawBody, signature })) {
    return NextResponse.json({ error: "签名校验失败" }, { status: 401 })
  }

  const envelope = safeParseEnvelope(rawBody)
  if (!envelope) {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 })
  }

  const event = typeof envelope.event === "string" ? envelope.event : ""
  const logId = typeof envelope.log_id === "string" ? envelope.log_id : ""

  /* URL 校验：抖音保存回调地址时发 verify_webhook，需原样回显 challenge */
  if (event === "verify_webhook") {
    const content = parseDouyinEventContent(envelope.content)
    const challenge = content?.challenge
    // challenge 可能是数字或字符串，原样回传（官方示例为数字）。
    return NextResponse.json({ challenge }, { status: 200 })
  }

  /* 业务事件：先记录日志、用 Msg-Id 留痕（抖音会重试，便于排查去重），暂不接业务管道 */
  const msgId = request.headers.get("msg-id") || ""
  console.log(
    "[integrations/douyin/events] 收到事件",
    "event=" + event,
    "log_id=" + logId,
    "msg_id=" + msgId,
    "client_key=" + (typeof envelope.client_key === "string" ? envelope.client_key : ""),
  )

  // 抖音要求：业务事件 200、2.5s 内返回、body 可空。
  return NextResponse.json({ ok: true }, { status: 200 })
}
