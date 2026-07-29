// ─── 飞书多智能体统一事件网关 ─────────────────────────────────
// 所有 agent bot 的事件订阅都指向本路由。
// 通过事件中的 verification token 识别"哪个机器人收到了消息"，
// 然后路由到对应工作流，以该机器人身份回复。
// 与旧 /api/integrations/feishu/events 并存，互不干扰。
// api-inventory: auth=signed_integration

import * as lark from "@larksuiteoapi/node-sdk"
import { NextResponse } from "next/server"
import { env } from "@/env"
import { parseFeishuSdkMessageEvent, verifyFeishuEventToken } from "@/lib/integrations/feishu-topic-chat"
import { resolveBotByVerificationToken, loadAgentBotRegistry, type FeishuAgentBotConfig } from "@/lib/feishu-agent-registry"
import { resolveAgentBotIntent } from "@/lib/feishu-agent-bot-router"
import { replyAsBot } from "@/lib/feishu-bot-identity"
import { verifyFeishuEventSignature } from "@/lib/feishu-event-signature"
import { ingestAimChannelMessage } from "@/features/aim-channels/aim-channel-ingest"
import { resolveChannelBinding } from "@/features/topics/services/inspiration-events"
import { getAgentBotAckReply } from "@/lib/feishu-agent-persona"

export const runtime = "nodejs"
export const maxDuration = 30

function requestHeaders(request: Request) {
  return Object.fromEntries(request.headers.entries())
}

/**
 * 从加密或明文 payload 中提取 verification token。
 * 飞书 SDK 的 EventDispatcher 会在 invoke 时校验 token，
 * 但我们需要在路由层提前识别 bot 身份。
 */
function extractVerificationToken(payload: Record<string, unknown>): string {
  // 明文模式：header.token 或顶层 token
  const header = payload.header as Record<string, unknown> | undefined
  if (header && typeof header.token === "string") return header.token
  if (typeof payload.token === "string") return payload.token as string

  // 加密模式：解密后提取
  if (typeof payload.encrypt === "string") {
    const registry = loadAgentBotRegistry()
    for (const bot of registry) {
      if (!bot.encryptKey) continue
      try {
        const decrypted = JSON.parse(new lark.AESCipher(bot.encryptKey).decrypt(payload.encrypt as string)) as Record<string, unknown>
        const decHeader = decrypted.header as Record<string, unknown> | undefined
        if (decHeader && typeof decHeader.token === "string") return decHeader.token
        if (typeof decrypted.token === "string") return decrypted.token
      } catch {
        continue
      }
    }
  }
  return ""
}

function challengePayload(payload: Record<string, unknown>, encryptKey: string) {
  const challenge = lark.generateChallenge(payload, { encryptKey })
  return challenge.isChallenge ? challenge.challenge : null
}

function verifyEncryptedPayload(
  payload: Record<string, unknown>,
  request: Request,
  encryptKey: string,
  rawBody: string,
  allowMissingSignature = false,
) {
  if (!payload.encrypt || !encryptKey) return true
  const headers = requestHeaders(request)
  return verifyFeishuEventSignature({
    timestamp: headers["x-lark-request-timestamp"] || "",
    nonce: headers["x-lark-request-nonce"] || "",
    encryptKey,
    bodyCandidates: [JSON.stringify(payload), rawBody],
    signature: headers["x-lark-signature"] || "",
    allowMissingSignature,
  })
}

/**
 * 解析消息发送者的 userId 和 projectId。
 * 优先使用 channel binding，回落到环境变量默认值。
 */
async function resolveMessageContext(chatId: string): Promise<{ userId: string; projectId: string } | null> {
  // 优先查 channel binding
  const binding = await resolveChannelBinding({ platform: "feishu", externalChatId: chatId })
  if (binding) {
    return { userId: binding.userId, projectId: binding.projectId }
  }

  // 回落到环境变量默认值
  const userId = env.FEISHU_AGENT_BOT_DEFAULT_USER_ID?.trim()
  const projectId = env.FEISHU_AGENT_BOT_DEFAULT_PROJECT_ID?.trim()
  if (userId && projectId) {
    return { userId, projectId }
  }

  return null
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>
  let rawBody: string
  try {
    rawBody = await request.text()
    if (Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
      return NextResponse.json({ error: "Feishu event payload too large" }, { status: 413 })
    }
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid payload")
    payload = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid Feishu event payload" }, { status: 400 })
  }

  // 识别 bot 身份
  const verificationToken = extractVerificationToken(payload)
  const bot = resolveBotByVerificationToken(verificationToken)

  // 未注册的 bot → 404（不是旧选题机器人的事件）
  if (!bot) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }

  const encryptKey = bot.encryptKey || env.FEISHU_ENCRYPT_KEY || ""

  // Challenge 验证（飞书事件订阅配置时的 URL 验证）
  try {
    const challenge = challengePayload(payload, encryptKey)
    if (challenge) {
      if (payload.encrypt && !verifyEncryptedPayload(payload, request, encryptKey, rawBody, true)) {
        return NextResponse.json({ error: "Invalid Feishu signature" }, { status: 401 })
      }
      if (payload.encrypt) {
        const decrypted = JSON.parse(new lark.AESCipher(encryptKey).decrypt(payload.encrypt as string)) as Record<string, unknown>
        if (!verifyFeishuEventToken(decrypted, bot.verificationToken)) {
          return NextResponse.json({ error: "Invalid Feishu verification token" }, { status: 401 })
        }
      } else if (!verifyFeishuEventToken(payload, bot.verificationToken)) {
        return NextResponse.json({ error: "Invalid Feishu verification token" }, { status: 401 })
      }
      return NextResponse.json(challenge)
    }
  } catch {
    return NextResponse.json({ error: "Feishu event decryption failed" }, { status: 400 })
  }

  // 签名验证（加密事件）
  if (payload.encrypt && !verifyEncryptedPayload(payload, request, encryptKey, rawBody)) {
    return NextResponse.json({ error: "Invalid Feishu signature" }, { status: 401 })
  }

  // 消息事件处理
  let handled = false
  let result: unknown = { ok: true, ignored: true }

  const dispatcher = new lark.EventDispatcher({
    verificationToken: bot.verificationToken,
    encryptKey: encryptKey || undefined,
    loggerLevel: lark.LoggerLevel.error,
  }).register({
    "im.message.receive_v1": async (data) => {
      handled = true
      if (data.token !== bot.verificationToken) throw new Error("FEISHU_INVALID_TOKEN")

      const event = parseFeishuSdkMessageEvent(data)
      if (!event) return { ok: true, ignored: true }

      // 解析消息上下文（userId / projectId）
      const context = await resolveMessageContext(event.chatId)
      if (!context) {
        await safeReplyAsBot(bot, event.messageId, "当前对话尚未绑定项目，请联系管理员配置。")
        return { ok: true, ignored: true, reason: "no_context" }
      }

      // 意图路由（一对一模式：默认直接交给 bot 自己的智能体）
      const routeResult = resolveAgentBotIntent(event.text, bot)

      if (routeResult.status === "cross_bot_redirect") {
        await safeReplyAsBot(bot, event.messageId, routeResult.message)
        return { ok: true, ignored: true, reason: "cross_bot_redirect" }
      }

      // 路由成功 → 调用现有 ingest 链路
      // platform 编码 botId（如 "feishu:content_growth"），供 generate task 注入角色约束
      const intent = routeResult.intent
      const ingested = await ingestAimChannelMessage({
        platform: `feishu:${bot.botId}`,
        externalMessageId: event.messageId,
        externalChatId: event.chatId,
        externalSenderId: event.senderId,
        userId: context.userId,
        projectId: context.projectId,
        content: `${intent.cleanedInput}`,
        defaultAgentId: intent.agentId,
      })

      // 即时回复（以该 bot 身份）
      if (ingested.shouldReply && ingested.immediateReply) {
        const ackText = ingested.status === "accepted"
          ? getAgentBotAckReply(bot.botId, intent.agentId)
          : ingested.immediateReply
        await safeReplyAsBot(bot, event.messageId, ackText)
      }

      return {
        ok: true,
        accepted: ingested.status === "accepted",
        ignored: ingested.status === "ignored",
        reason: ingested.reason,
        botId: bot.botId,
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
    console.error("[integrations/feishu/agent-events] failed", error)
    return NextResponse.json({ error: "Feishu event processing failed" }, { status: 500 })
  }

  if (!handled && result === undefined) {
    return NextResponse.json({ error: "Feishu signature verification failed" }, { status: 401 })
  }
  return NextResponse.json(result ?? { ok: true, ignored: true })
}

/** 安全回复：失败不抛错，避免阻断消息接收。 */
async function safeReplyAsBot(bot: FeishuAgentBotConfig, messageId: string, text: string): Promise<void> {
  try {
    await replyAsBot({
      bot,
      messageId,
      text,
      idempotencyKey: `agent-bot-ack:${messageId}`,
    })
  } catch (error) {
    console.error(`[agent-events] reply as ${bot.botId} failed`, error)
  }
}
