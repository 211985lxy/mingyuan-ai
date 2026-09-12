// ─── 每日灵感回顾卡：把用户最近 24h 在群里发的灵感推回给他 ────────
// 复用「选题策划官」身份与每日推送通道。设计动机：灵感记完不能沉底——
// 用户往群里扔链接+点评+知识，第二天早上应该看到"系统确实记住了什么"。
// 与裁决卡分开渲染：这是回顾不是裁决，没有按钮，条目可点开原链接。

import { readHotBriefingPushConfig } from "@/lib/aim/feishu-hot-briefing-notify"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"

const TOPIC_REVIEW_BOT_ID = "business_diagnosis"
/** 回顾卡最多列几条，多出的以合计行提示 */
export const INSPIRATION_DIGEST_LIMIT = 8
/** 评述展示长度上限：回顾是扫一眼，不是精读 */
const NOTE_PREVIEW_MAX = 60

export interface InspirationDigestEntry {
  id: string
  /** 用户原文（可能混排链接），渲染时自动剥离 URL */
  content: string
  sourceUrl: string | null
  /** processingStage 或 aiStatus，映射成人话 */
  processingStage: string | null
  aiStatus: string
  createdAt: Date
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim()
}

function stageLabel(entry: InspirationDigestEntry): string {
  const stage = entry.processingStage || entry.aiStatus
  if (entry.aiStatus === "failed") return "没扒到文案"
  if (stage === "captured" || entry.aiStatus === "completed") return "文案扒好了"
  if (stage === "queued" || stage === "pending" || stage === "deferred") return "正在扒文案"
  return stage || "处理中"
}

function formatEntryTime(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** 单条回顾行：灵感点（剥链接后的评述）+ 时间 + 状态 + 原片链接。 */
export function formatDigestEntryLine(entry: InspirationDigestEntry): string {
  const note = stripUrls(entry.content)
  const preview = note.length > NOTE_PREVIEW_MAX ? `${note.slice(0, NOTE_PREVIEW_MAX)}…` : note
  const link = entry.sourceUrl ? `｜[原片](${entry.sourceUrl})` : ""
  return `- ${preview || "只丢了个链接"}｜${formatEntryTime(entry.createdAt)}｜${stageLabel(entry)}${link}`
}

/** 无灵感时不推卡；有则返回完整卡片 JSON 对象。 */
export function buildInspirationDigestCard(entries: InspirationDigestEntry[]): Record<string, unknown> | null {
  if (entries.length === 0) return null
  const shown = entries.slice(0, INSPIRATION_DIGEST_LIMIT)
  const overflow = entries.length - shown.length
  const lines = shown.map(formatDigestEntryLine)
  if (overflow > 0) lines.push(`- …还有 ${overflow} 条，在 AIM 里都能看到`)
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "灵感小账本 · 昨天记的" },
      template: "turquoise",
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: `**昨天你在群里随手记了 ${entries.length} 条，都收好了**\n${lines.join("\n")}` },
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "这些都会变成写选题的素材。继续往群里丢链接+想法就行。",
          },
        ],
      },
    ],
  }
}

/**
 * @description 推送灵感回顾卡（开关关闭或凭证不全时静默跳过；空列表不推）
 * @returns 推送结果；失败原因可供 cron 记录
 */
export async function sendInspirationDigestToFeishu(
  entries: InspirationDigestEntry[],
): Promise<{ sent: boolean; reason?: string }> {
  const card = buildInspirationDigestCard(entries)
  if (!card) return { sent: false, reason: "最近 24 小时没有灵感记录" }

  const config = readHotBriefingPushConfig()
  if (!config.enabled) {
    return { sent: false, reason: "推送未启用（AIM_HOT_BRIEFING_PUSH_ENABLED 非 true）" }
  }
  const bot = resolveBotById(TOPIC_REVIEW_BOT_ID)
  if (!bot) {
    return { sent: false, reason: "选题策划官凭证未配置（FEISHU_BOT_TOPIC_PLANNER_* 不全）" }
  }

  await sendCardAsBot({
    bot,
    chatId: config.chatId,
    cardJson: JSON.stringify(card),
    // 按日期幂等：同一天重复触发 cron 不会重发回顾
    idempotencyKey: `inspiration-digest-${new Date().toISOString().slice(0, 10)}`,
  })
  return { sent: true }
}
