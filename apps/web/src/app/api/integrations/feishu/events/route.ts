import { createHash } from "node:crypto"
import * as lark from "@larksuiteoapi/node-sdk"
import { NextResponse } from "next/server"
import { env } from "@/env"
import { parseJsonRecord } from "@/lib/api-contract"
import { parseFeishuSdkMessageEvent, verifyFeishuEventToken } from "@/lib/integrations/feishu-topic-chat"
import { ingestInspirationEvent, resolveChannelBinding, resolveBindingExecutionMode } from "@/features/topics/services/inspiration-events"
import { INSPIRATION_ACCEPTED_REPLY } from "@/features/topics/services/inspiration-reply"
import { isReplySuppressed } from "@/lib/execution-mode"

export const runtime = "nodejs"
export const maxDuration = 30

function requestHeaders(request: Request) {
  return Object.fromEntries(request.headers.entries())
}

function challengePayload(payload: Record<string, unknown>) {
  const challenge = lark.generateChallenge(payload, { encryptKey: env.FEISHU_ENCRYPT_KEY || "" })
  return challenge.isChallenge ? challenge.challenge : null
}

function verifyEncryptedChallengeToken(payload: Record<string, unknown>) {
  const encryptKey = env.FEISHU_ENCRYPT_KEY
  const verificationToken = env.FEISHU_VERIFICATION_TOKEN
  if (typeof payload.encrypt !== "string" || !encryptKey || !verificationToken) return false
  const decrypted = JSON.parse(new lark.AESCipher(encryptKey).decrypt(payload.encrypt)) as Record<string, unknown>
  return verifyFeishuEventToken(decrypted, verificationToken)
}

function verifyEncryptedPayload(payload: Record<string, unknown>, request: Request) {
  if (!payload.encrypt || !env.FEISHU_ENCRYPT_KEY) return true
  const headers = requestHeaders(request)
  const timestamp = headers["x-lark-request-timestamp"] || ""
  const nonce = headers["x-lark-request-nonce"] || ""
  const signature = headers["x-lark-signature"] || ""
  const expected = createHash("sha256")
    .update(timestamp + nonce + env.FEISHU_ENCRYPT_KEY + JSON.stringify(payload))
    .digest("hex")
  return Boolean(signature) && signature === expected
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: Request) {
  if (env.FEISHU_TOPIC_PIPELINE_ENABLED === "false") {
    return NextResponse.json({ error: "Feishu inspiration pipeline is disabled" }, { status: 503 })
  }
  if (!env.FEISHU_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: "Feishu verification token is not configured" }, { status: 503 })
  }
  let payload: Record<string, unknown>
  try {
    payload = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "Invalid Feishu event payload" }, { status: 400 })
  }

  try {
    const challenge = challengePayload(payload)
    if (challenge) {
      if (payload.encrypt && !verifyEncryptedPayload(payload, request)) {
        return NextResponse.json({ error: "Invalid Feishu signature" }, { status: 401 })
      }
      if (payload.encrypt && !verifyEncryptedChallengeToken(payload)) {
        return NextResponse.json({ error: "Invalid Feishu verification token" }, { status: 401 })
      }
      if (!payload.encrypt && !verifyFeishuEventToken(payload, env.FEISHU_VERIFICATION_TOKEN)) {
        return NextResponse.json({ error: "Invalid Feishu verification token" }, { status: 401 })
      }
      return NextResponse.json(challenge)
    }
  } catch {
    return NextResponse.json({ error: "Feishu event decryption failed" }, { status: 400 })
  }
  // When replies are suppressed (capture_only / evaluate mode), Feishu reply
  // credentials are not required. When in live mode, they must be present.
  const globalMode = resolveBindingExecutionMode(null)
  if (!isReplySuppressed(globalMode) && (!env.FEISHU_APP_ID || !env.FEISHU_APP_SECRET)) {
    return NextResponse.json({ error: "Feishu reply credentials are not configured" }, { status: 503 })
  }

  let handled = false
  let result: unknown = { ok: true, ignored: true }
  const dispatcher = new lark.EventDispatcher({
    verificationToken: env.FEISHU_VERIFICATION_TOKEN,
    encryptKey: env.FEISHU_ENCRYPT_KEY,
    loggerLevel: lark.LoggerLevel.error,
  }).register({
    "im.message.receive_v1": async (data) => {
      handled = true
      if (data.token !== env.FEISHU_VERIFICATION_TOKEN) throw new Error("FEISHU_INVALID_TOKEN")
      const event = parseFeishuSdkMessageEvent(data)
      if (!event) return { ok: true, ignored: true }
      const binding = await resolveChannelBinding({ platform: "feishu", externalChatId: event.chatId })
      if (!binding) return { ok: true, ignored: true, reason: "channel_unbound" }
      try {
        const ingested = await ingestInspirationEvent({
          platform: "feishu",
          externalMessageId: event.messageId,
          externalChatId: event.chatId,
          externalAccountId: binding.externalAccountId || undefined,
          externalSenderId: event.senderId,
          projectId: binding.projectId,
          content: event.text,
          occurredAt: event.occurredAt,
          conversationType: "group",
          mentionsBot: event.mentionsBot,
        }, binding.userId, {
          // Accepted reply is enqueued atomically inside the ingest transaction
          acceptedReplyContext: {
            externalChatId: event.chatId,
            externalMessageId: event.messageId,
            replyText: INSPIRATION_ACCEPTED_REPLY,
          },
        })
        return { ok: true, accepted: true, id: ingested.id, duplicate: ingested.duplicate }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("INSPIRATION_TRIGGER")) {
          return { ok: true, ignored: true, reason: "trigger_not_matched" }
        }
        throw error
      }
    },
  })

  const sdkPayload = Object.assign(Object.create({ headers: requestHeaders(request) }), payload)
  try {
    result = await dispatcher.invoke(sdkPayload)
  } catch (error) {
    if (error instanceof Error && error.message === "FEISHU_INVALID_TOKEN") {
      return NextResponse.json({ error: "Invalid Feishu verification token" }, { status: 401 })
    }
    console.error("[integrations/feishu/events] failed", error)
    return NextResponse.json({ error: "Feishu event processing failed" }, { status: 500 })
  }
  if (!handled && result === undefined) return NextResponse.json({ error: "Feishu signature verification failed" }, { status: 401 })
  return NextResponse.json(result ?? { ok: true, ignored: true })
}
