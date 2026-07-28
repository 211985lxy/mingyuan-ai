// @ts-nocheck — CONTENT_PIPELINE_ENABLED env 待注册，临时跳过
import { createHash } from "node:crypto"
import * as lark from "@larksuiteoapi/node-sdk"
import { NextResponse } from "next/server"
import { env } from "@/env"
import { parseJsonRecord } from "@/lib/api-contract"
import { parseFeishuSdkMessageEvent, verifyFeishuEventToken, getFeishuTenantAccessToken, replyFeishuTextMessage, shouldPrioritizeInspirationCapture } from "@/lib/integrations/feishu-topic-chat"
import { ingestInspirationEvent, isExplicitInspirationCaptureMessage, resolveChannelBinding, resolveBindingExecutionMode } from "@/features/topics/services/inspiration-events"
import { INSPIRATION_ACCEPTED_REPLY } from "@/features/topics/services/inspiration-reply"
import { isReplySuppressed } from "@/lib/execution-mode"
import { ingestAimChannelMessage } from "@/features/aim-channels/aim-channel-ingest"
import { detectVideoLinks, processVideo } from "@/lib/content-pipeline"

export const runtime = "nodejs"
export const maxDuration = 120

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

      const captureFromAimChat = shouldPrioritizeInspirationCapture(binding.routeTarget,
        isExplicitInspirationCaptureMessage(event.text, binding.triggerKeywords))
      // ─── 视频链接分流：显式收选题优先进入影子采集，其余视频走原内容流水线 ───
      if (env.CONTENT_PIPELINE_ENABLED !== "false" && !captureFromAimChat) {
        const detection = detectVideoLinks(event.text)
        if (detection.hasLinks) {
          const firstLink = detection.links[0]
          const platformLabel =
            firstLink.platform === "douyin" ? "抖音" :
            firstLink.platform === "channels" ? "视频号" :
            firstLink.platform === "bilibili" ? "B站" :
            firstLink.platform === "xiaohongshu" ? "小红书" : firstLink.platform

          if (!isReplySuppressed(globalMode)) {
            await sendImmediateFeishuReply(event.messageId,
              `✅ 收到${platformLabel}视频链接，正在执行处理流水线...\n🔗 ${firstLink.url}\n\n📦 5a提取 → 5b总结 → 5c选题 → 5d竞品 → 5e文案`)
          }

          // 异步执行完整流水线，不阻塞飞书响应
          processVideo({
            videoUrl: firstLink.url,
            source: `${platformLabel}群`,
            contextText: detection.textWithoutLinks,
            userId: binding.userId || undefined,
          }).then(async (result) => {
            if (isReplySuppressed(globalMode)) return
            try {
              const token = await getFeishuTenantAccessToken({ appId: env.FEISHU_APP_ID!, appSecret: env.FEISHU_APP_SECRET! })
              const text = result.success ? buildVideoCompletionMessage(result) : `❌ 处理失败：${result.error}`
              await replyFeishuTextMessage({ messageId: event.messageId, text, tenantAccessToken: token, idempotencyKey: `video-pipeline:${event.messageId}` })
            } catch { /* silent */ }
          }).catch(() => {})

          return { ok: true, routed: "video_pipeline", url: firstLink.url, platform: firstLink.platform }
        }
      }

      // AIM 群保留日常对话；只有明确的"收集关键词 + 视频链接"绕到灵感入库。
      if (binding.routeTarget === "aim" && !captureFromAimChat) {
        const ingested = await ingestAimChannelMessage({
          platform: "feishu",
          externalMessageId: event.messageId,
          externalChatId: event.chatId,
          externalSenderId: event.senderId,
          userId: binding.userId,
          projectId: binding.projectId,
          content: event.text,
          defaultAgentId: binding.defaultAgentId,
        })
        // 需要即时回复时（"收到…"或帮助文案），在 live 模式下线程回复用户
        if (ingested.shouldReply && ingested.immediateReply) {
          await sendImmediateFeishuReply(event.messageId, ingested.immediateReply)
        }
        return {
          ok: true,
          accepted: ingested.status === "accepted",
          ignored: ingested.status === "ignored",
          reason: ingested.reason,
        }
      }

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

/**
 * 在 AIM 对话链路里，收到消息后立即线程回复一条提示（"收到…"或帮助文案）。
 * 凭证缺失或发送失败时不抛错，避免阻断消息接收与后台任务入队。
 */
async function sendImmediateFeishuReply(messageId: string, text: string): Promise<void> {
  const appId = env.FEISHU_APP_ID
  const appSecret = env.FEISHU_APP_SECRET
  if (!appId || !appSecret) return
  try {
    const token = await getFeishuTenantAccessToken({ appId, appSecret })
    await replyFeishuTextMessage({
      messageId,
      text,
      tenantAccessToken: token,
      idempotencyKey: `aim-channel-ack:${messageId}`,
    })
  } catch (error) {
    console.error("[integrations/feishu/events] immediate reply failed", error)
  }
}

/**
 * 构建视频处理完成后的飞书回复消息。
 */
function buildVideoCompletionMessage(
  result: Awaited<ReturnType<typeof processVideo>>,
): string {
  const lines: string[] = []
  const duration = `${Math.round((result.durationMs || 0) / 1000)}秒`
  lines.push(`🎬 处理完成（耗时${duration}）`)

  // 5a
  if (result.extraction) {
    const d = result.extraction.duration ? ` | ${result.extraction.duration}` : ""
    lines.push(`\n📋 [5a 文案提取] ${result.extraction.title || "未知"}${d}`)
  }

  // 5b
  if (result.aiSummary) {
    lines.push(`\n📝 [5b AI 总结] ${result.aiSummary.title}`)
    lines.push(result.aiSummary.summary)
    if (result.aiSummary.keyPoints.length > 0) {
      lines.push(`\n🔑 要点：\n${result.aiSummary.keyPoints.map((p) => `• ${p}`).join("\n")}`)
    }
  }

  // 5c
  if (result.topicExtraction?.success && result.topicExtraction.cards.length > 0) {
    lines.push(`\n🎯 [5c 选题提取] 生成 ${result.topicExtraction.cards.length} 个选题：`)
    for (const card of result.topicExtraction.cards.slice(0, 3)) {
      lines.push(`  • ${card.title}${card.topicType ? `（${card.topicType}）` : ""}`)
    }
    if (result.topicExtraction.topicSelectionId) {
      lines.push(`  💾 选题已存入 DB: ${result.topicExtraction.topicSelectionId.slice(0, 8)}...`)
    }
  } else if (result.topicExtraction?.error) {
    lines.push(`\n🎯 [5c 选题] ⚠️ ${result.topicExtraction.error}`)
  }

  // 5d
  if (result.competitorMatch?.isCompetitor) {
    lines.push(`\n⚔️ [5d 竞品标记] ⚠️ 检测到竞品：${result.competitorMatch.competitorName}`)
  } else if (result.competitorMatch) {
    lines.push(`\n⚔️ [5d 竞品标记] ✅ 非关注竞品`)
  }

  // 5e
  if (result.copyInspiration?.success) {
    lines.push(`\n✨ [5e 文案灵感]`)
    if (result.copyInspiration.hook) lines.push(`  开头方向：${result.copyInspiration.hook}`)
    if (result.copyInspiration.direction) lines.push(`  内容方向：${result.copyInspiration.direction}`)
    if (result.copyInspiration.recommendedPlatform) lines.push(`  推荐平台：${result.copyInspiration.recommendedPlatform}`)
  } else if (result.copyInspiration?.error) {
    lines.push(`\n✨ [5e 文案灵感] ⚠️ ${result.copyInspiration.error}`)
  }

  lines.push(`\n📁 已写入飞书素材库`)
  return lines.join("\n")
}
