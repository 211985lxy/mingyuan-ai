// ─── 选题晚报：每天晚上汇报今天的选题与灵感动态 ─────────────────
// 早报（09:10）管「提案与裁决」，晚报（21:00）管「实际发生了什么」：
//   1. 今日选题批次与你的裁决结果（adopted/archived/未裁决）
//   2. 今天记录的灵感（数量与提取状态）
//   3. 数据采集健康度（热榜快照是否停摆——38 天停摆教训的巡检位）
// 纯读取零 LLM 成本；空天也推（确认系统活着，比沉默可靠）。

import { readHotBriefingPushConfig } from "@/lib/aim/feishu-hot-briefing-notify"
import {
  candidateTitle,
  loadDailyTopicSnapshot,
  type DailySelectionSummary,
} from "@/lib/aim/daily-topic-snapshot"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"

const TOPIC_REVIEW_BOT_ID = "business_diagnosis"

/** 兼容既有导出名：与共享快照的批次结构同源。 */
export type EveningSelectionSummary = DailySelectionSummary

export interface EveningReportData {
  selections: EveningSelectionSummary[]
  inspirationCount: number
  inspirationExtracted: number
  inspirationFailed: number
  hotSnapshotAt: Date | null
}

function reviewLabel(status: string): string {
  if (status === "adopted") return "挑了"
  if (status === "archived") return "都不要，先存着"
  if (status === "regenerated") return "换过了"
  return "还没挑"
}

/** 选题区：每批一行结果；挑了的带选题标题。 */
export function formatSelectionLines(selections: EveningSelectionSummary[]): string[] {
  if (selections.length === 0) return ["今天还没生成选题。"]
  return selections.map((selection) => {
    const title = candidateTitle(selection.candidates, selection.selectedIndex)
    const adopted = title ? `｜选了「${title}」` : ""
    return `- 批次 ${selection.selectionId.slice(-6)}｜${reviewLabel(selection.reviewStatus)}${adopted}`
  })
}

/** 灵感与健康度区。 */
export function formatStatusLines(data: Pick<EveningReportData, "inspirationCount" | "inspirationExtracted" | "inspirationFailed" | "hotSnapshotAt">): string[] {
  const lines = [
    `- 今天记的灵感：${data.inspirationCount} 条（扒好 ${data.inspirationExtracted}｜没扒到 ${data.inspirationFailed}）`,
  ]
  if (data.hotSnapshotAt) {
    const ageHours = Math.floor((Date.now() - data.hotSnapshotAt.getTime()) / 3_600_000)
    lines.push(`- 热点数据：正常（${ageHours} 小时前更新）`)
  } else {
    lines.push("- 热点数据：⚠️ 断了，选题会少点时效感")
  }
  return lines
}

/** 空天也返回卡片（确认系统活着）；数据缺失时返回 null 由调用方决定跳过。 */
export function buildEveningReportCard(data: EveningReportData, projectName: string | null): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "今日小结" },
      template: "indigo",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            projectName ? `**项目**：${projectName}` : "",
            `**今天的选题**\n${formatSelectionLines(data.selections).join("\n")}`,
            `**今天的动态**\n${formatStatusLines(data).join("\n")}`,
          ].filter(Boolean).join("\n\n"),
        },
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "早上出主意、晚上对个账。还没挑的明天接着挑就行。",
          },
        ],
      },
    ],
  }
}

/**
 * @description 推送选题晚报（开关关闭或凭证不全时静默跳过）
 * @returns 推送结果；失败原因可供 cron 记录
 */
export async function sendEveningReportToFeishu(
  data: EveningReportData,
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
    cardJson: JSON.stringify(buildEveningReportCard(data, projectName)),
    // 按日期幂等：同一天重复触发不重发
    idempotencyKey: `topic-evening-${new Date().toISOString().slice(0, 10)}`,
  })
  return { sent: true }
}

/** 晚报数据 = 当日共享快照（读取逻辑集中在 daily-topic-snapshot）。 */
export const loadEveningReportData = loadDailyTopicSnapshot
