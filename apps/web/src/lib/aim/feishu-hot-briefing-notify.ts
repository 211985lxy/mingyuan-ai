// ─── 每日热点简报飞书推送 ─────────────────────────────────────
// 用"选题策划官"(business_diagnosis)身份，把热点简报 markdown 以飞书卡片推送到指定群。
// 独立开关（AIM_HOT_BRIEFING_PUSH_ENABLED），不污染旧 supervisor 通知体系。
// 用 resolveBotById 而非 workflowId：sales_diagnosis 同时绑了商业诊断官和选题策划官，
// 按 workflowId 反查会误中商业诊断官。

import { env } from "@/env"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"

const HOT_BRIEFING_BOT_ID = "business_diagnosis"

function readHotBriefingPushConfig():
  | { enabled: false }
  | { enabled: true; chatId: string } {
  if (env.AIM_HOT_BRIEFING_PUSH_ENABLED?.trim().toLowerCase() !== "true") {
    return { enabled: false }
  }
  const chatId = env.AIM_HOT_BRIEFING_CHAT_ID?.trim() || ""
  if (!chatId) {
    throw new Error("热点简报推送已启用但缺少 AIM_HOT_BRIEFING_CHAT_ID")
  }
  return { enabled: true, chatId }
}

/**
 * 把简报 markdown 包成飞书卡片 JSON 字符串。
 * 用 markdown 元素渲染，header 用品牌红色 template（red）。
 */
export function buildHotBriefingCard(markdown: string, title: string): string {
  const card = {
    schema: "1.0",
    header: {
      title: { tag: "plain_text", content: title },
      template: "red",
    },
    elements: [
      { tag: "markdown", content: markdown },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "由明动AIM · 选题策划官自动推送，每日 09:00",
          },
        ],
      },
    ],
  }
  return JSON.stringify(card)
}

/**
 * 以选题策划官身份把热点简报推送到配置的飞书群。
 * - 开关关闭或凭证不全时静默跳过（返回 { sent: false }）。
 * - 推送本身抛错由调用方决定如何处理（建议 try/catch 只记日志，不阻断简报入库）。
 */
export async function sendHotBriefingToFeishu(input: {
  markdown: string
  title: string
}): Promise<{ sent: boolean; reason?: string }> {
  const config = readHotBriefingPushConfig()
  if (!config.enabled) {
    return { sent: false, reason: "推送未启用（AIM_HOT_BRIEFING_PUSH_ENABLED 非 true）" }
  }

  const bot = resolveBotById(HOT_BRIEFING_BOT_ID)
  if (!bot) {
    return { sent: false, reason: "选题策划官凭证未配置（FEISHU_BOT_TOPIC_PLANNER_* 不全）" }
  }

  const cardJson = buildHotBriefingCard(input.markdown, input.title)
  // 幂等键按日期生成，避免同一天重复推送
  const idempotencyKey = `hot-briefing-${new Date().toISOString().slice(0, 10)}`

  await sendCardAsBot({ bot, chatId: config.chatId, cardJson, idempotencyKey })
  return { sent: true }
}
