import { NextResponse } from "next/server"

import {
  buildFeishuTextReply,
  getFeishuTenantAccessToken,
  parseFeishuMessageEvent,
  replyFeishuTextMessage,
  verifyFeishuEventToken,
} from "@/lib/integrations/feishu-topic-chat"
import { handleTopicChatMessage } from "@/lib/topic-chat-service"
import { detectVideoLinks } from "@/lib/content-pipeline"
import { processVideo } from "@/lib/content-pipeline"

export const maxDuration = 120 // 视频转录需要更长时间

/**
 * 飞书事件接收端点
 *
 * 处理两条消息流：
 *   1. 选题聊天（原有）：用户发文本 → AIM 选题推荐 → 飞书回复
 *   2. 视频素材收集（新增）：消息含视频链接 → 检测→转录→总结→写入飞书Base
 */
export async function POST(request: Request) {
  const payload = await request.json()
  const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN || ""

  if (!verifyFeishuEventToken(payload, verificationToken)) {
    return NextResponse.json({ error: "invalid feishu token" }, { status: 401 })
  }

  if (payload?.encrypt) {
    return NextResponse.json({ error: "encrypted feishu events are not enabled" }, { status: 400 })
  }

  // URL 验证挑战（飞书平台要求）
  if (payload?.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge })
  }

  const event = parseFeishuMessageEvent(payload)
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  const appId = process.env.FEISHU_APP_ID || ""
  const appSecret = process.env.FEISHU_APP_SECRET || ""
  if (!appId || !appSecret) {
    return NextResponse.json({ error: "feishu env is not configured" }, { status: 503 })
  }

  // ─── 分流：检测是否包含视频链接 ──────────────────────────────
  const detection = detectVideoLinks(event.text)

  if (detection.hasLinks) {
    // 路由到视频处理流水线
    return handleVideoPipeline(event.messageId, detection.links[0].url, detection.links[0].platform, event.text, appId, appSecret)
  }

  // ─── 原有选题聊天逻辑 ──────────────────────────────────────
  const userId = process.env.FEISHU_TOPIC_CHAT_USER_ID || ""
  const projectId = process.env.FEISHU_TOPIC_CHAT_PROJECT_ID || ""
  if (!userId || !projectId) {
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

// ─── 视频处理流水线 handler ──────────────────────────────────

async function handleVideoPipeline(
  messageId: string,
  videoUrl: string,
  platform: string,
  fullText: string,
  appId: string,
  appSecret: string,
): Promise<NextResponse> {
  try {
    // 立即回复"已收到"，避免飞书 3s 超时
    const tenantAccessToken = await getFeishuTenantAccessToken({ appId, appSecret })

    const platformLabel = platform === "douyin" ? "抖音" :
      platform === "channels" ? "视频号" :
      platform === "bilibili" ? "B站" :
      platform === "xiaohongshu" ? "小红书" : platform

    await replyFeishuTextMessage({
      messageId,
      text: `✅ 收到${platformLabel}视频链接，正在提取文案并生成总结...\n🔗 ${videoUrl}`,
      tenantAccessToken,
    })

    // 异步处理（不阻塞响应）
    processVideo({
      videoUrl,
      source: `${platformLabel}群`,
      contextText: fullText,
    }).then(async (result) => {
      try {
        const token = await getFeishuTenantAccessToken({ appId, appSecret })
        if (result.success) {
          const title = result.aiSummary?.title || result.extraction?.title || "未知标题"
          const summary = result.aiSummary?.summary || ""
          const points = result.aiSummary?.keyPoints?.join("\n• ") || ""
          const duration = `${Math.round((result.durationMs || 0) / 1000)}秒`

          await replyFeishuTextMessage({
            messageId,
            text: `🎬 处理完成（耗时${duration}）\n\n📌 ${title}\n\n📝 ${summary}\n\n🔑 要点：\n• ${points}\n\n📁 已写入飞书素材库`,
            tenantAccessToken: token,
          })
        } else {
          await replyFeishuTextMessage({
            messageId,
            text: `❌ 处理失败：${result.error}\n🔗 ${videoUrl}`,
            tenantAccessToken: token,
          })
        }
      } catch {
        // 回复失败时静默处理
      }
    }).catch(() => {
      // 处理异常时静默
    })

    return NextResponse.json({ ok: true, routed: "video_pipeline" })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
