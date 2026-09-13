// ─── 选题午报：午间检查进度，安排下午 ───────────────────────────
// 三报分工：早报提案（09:10）→ 午报推进（12:30）→ 晚报对账（21:00）。
// 午报只做早报与晚报都不做的事：
//   1. 早上那批挑了没——没挑的选题等于白生成，这是最该提醒的一件事
//   2. 已经挑了哪个 → 下午直接开拍（附钩子与角度）
//   3. 上午记了几条灵感
//   4. 当前热榜里值得下午借势的（午后热点与早报时的榜单已经不同）
// 纯读取 + 一次热榜读取，零 LLM 成本。

import { getLatestHotList } from "@/lib/douyin-hot"
import { decideDouyinItems } from "@/lib/hot-decisions"
import { readHotBriefingPushConfig } from "@/lib/aim/feishu-hot-briefing-notify"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"
import { candidateTitle, type DailyTopicSnapshot } from "@/lib/aim/daily-topic-snapshot"

const TOPIC_REVIEW_BOT_ID = "business_diagnosis"
/** 午报最多列几条可借势热点 */
const NOON_HOT_LIMIT = 3

export interface NoonHotItem {
  title: string
  score: number
  url: string
}

/**
 * 进度区：早上那批挑了没。
 * 未挑的单独点名——这是午报存在的主要理由。
 */
export function formatProgressLines(snapshot: DailyTopicSnapshot): string[] {
  if (snapshot.selections.length === 0) {
    return ["- 今天还没生成选题。"]
  }
  const pending = snapshot.selections.filter((item) => item.reviewStatus === "pending")
  const lines = [
    `- 今天出了 ${snapshot.selections.length} 批选题，已挑 ${snapshot.selections.length - pending.length} 批。`,
  ]
  if (pending.length > 0) {
    lines.push(`- ⏰ 还有 ${pending.length} 批没挑——挑完才好安排拍摄，在早报那张卡上点一下就行。`)
  }
  return lines
}

/** 下午安排区：已挑的选题给出开拍提示。 */
export function formatShootLines(snapshot: DailyTopicSnapshot): string[] {
  const adopted = snapshot.selections.filter((item) => item.reviewStatus === "adopted")
  if (adopted.length === 0) return []
  const lines = adopted
    .map((item) => {
      const title = candidateTitle(item.candidates, item.selectedIndex)
      return title ? `- 下午可以拍：「${title}」` : null
    })
    .filter((line): line is string => line !== null)
  return lines
}

export interface NoonReportData {
  snapshot: DailyTopicSnapshot
  hotItems: NoonHotItem[]
}

/** 借势热点区：当前热榜里评分最高、值得下午蹭的几条。 */
export function formatHotLines(hotItems: NoonHotItem[]): string[] {
  if (hotItems.length === 0) return []
  return [
    "**下午可以借势的热点**",
    ...hotItems.map((item) => `- ${item.title}（热度 ${item.score}）[去看看](${item.url})`),
  ]
}

/** 数据缺失时返回 null 由调用方跳过（午报无内容就不打扰）。 */
export function buildNoonReportCard(data: NoonReportData, projectName: string | null): Record<string, unknown> {
  const blocks = [
    projectName ? `**项目**：${projectName}` : "",
    `**选题进度**\n${formatProgressLines(data.snapshot).join("\n")}`,
    formatShootLines(data.snapshot).join("\n"),
    `**上午的灵感**\n- ${data.snapshot.inspirationCount} 条（扒好 ${data.snapshot.inspirationExtracted}｜没扒到 ${data.snapshot.inspirationFailed}）`,
    formatHotLines(data.hotItems).join("\n"),
  ].filter(Boolean)

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "午间速览" },
      template: "orange",
    },
    elements: [
      { tag: "div", text: { tag: "lark_md", content: blocks.join("\n\n") } },
      {
        tag: "note",
        elements: [{ tag: "plain_text", content: "午间看一眼进度，晚上再一起对账。" }],
      },
    ],
  }
}

/** 取当前热榜里最值得借势的几条；读取失败降级为空（午报其余内容照常）。 */
export async function loadNoonHotItems(): Promise<NoonHotItem[]> {
  try {
    const items = await getLatestHotList()
    return decideDouyinItems(items)
      .slice(0, NOON_HOT_LIMIT)
      .map((item) => ({ title: item.title, score: item.score, url: item.url }))
  } catch (error) {
    console.warn("[topic-noon] 热榜读取失败（跳过借势区）:", error)
    return []
  }
}

/**
 * @description 推送午间速览（开关关闭或凭证不全时静默跳过）
 * @returns 推送结果；失败原因可供 cron 记录
 */
export async function sendNoonReportToFeishu(
  data: NoonReportData,
  projectName: string | null,
): Promise<{ sent: boolean; reason?: string }> {
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
    cardJson: JSON.stringify(buildNoonReportCard(data, projectName)),
    // 按日期幂等：同一天重复触发不重发
    idempotencyKey: `topic-noon-${new Date().toISOString().slice(0, 10)}`,
  })
  return { sent: true }
}
