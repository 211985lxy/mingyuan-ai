import { env } from "@/env"
import { getFeishuTenantAccessToken, replyFeishuTextMessage } from "@/lib/integrations/feishu-topic-chat"
import { processVideo } from "@/lib/content-pipeline"

/**
 * 飞书事件路由的即时回复与完成消息构建（从 api/integrations/feishu/events/route.ts
 * 抽出，保持路由文件薄；只做消息拼装与发送，不做事件分发）。
 */

/**
 * 在 AIM 对话链路里，收到消息后立即线程回复一条提示（"收到…"或帮助文案）。
 * 凭证缺失或发送失败时不抛错，避免阻断消息接收与后台任务入队。
 */
export async function sendImmediateFeishuReply(messageId: string, text: string): Promise<void> {
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
export function buildVideoCompletionMessage(
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
