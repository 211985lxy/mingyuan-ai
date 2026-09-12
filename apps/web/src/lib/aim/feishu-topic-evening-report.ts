// ─── 选题晚报：每天晚上汇报今天的选题与灵感动态 ─────────────────
// 早报（09:10）管「提案与裁决」，晚报（21:00）管「实际发生了什么」：
//   1. 今日选题批次与你的裁决结果（adopted/archived/未裁决）
//   2. 今天记录的灵感（数量与提取状态）
//   3. 数据采集健康度（热榜快照是否停摆——38 天停摆教训的巡检位）
// 纯读取零 LLM 成本；空天也推（确认系统活着，比沉默可靠）。

import { prisma } from "@/lib/prisma"
import { readHotBriefingPushConfig } from "@/lib/aim/feishu-hot-briefing-notify"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"

const TOPIC_REVIEW_BOT_ID = "business_diagnosis"

export interface EveningSelectionSummary {
  selectionId: string
  reviewStatus: string
  selectedIndex: number | null
  candidates: unknown
}

export interface EveningReportData {
  selections: EveningSelectionSummary[]
  inspirationCount: number
  inspirationExtracted: number
  inspirationFailed: number
  hotSnapshotAt: Date | null
}

function candidateTitle(candidates: unknown, index: number | null): string | null {
  if (index === null) return null
  if (!Array.isArray(candidates)) return null
  const card = candidates[index] as { title?: unknown } | undefined
  return typeof card?.title === "string" ? card.title : null
}

function reviewLabel(status: string): string {
  if (status === "adopted") return "已采用"
  if (status === "archived") return "都不行（观察池）"
  if (status === "regenerated") return "已换一批"
  return "未裁决"
}

/** 选题区：每批一行裁决结果；采用了的带选题标题。 */
export function formatSelectionLines(selections: EveningSelectionSummary[]): string[] {
  if (selections.length === 0) return ["今日没有生成选题批次。"]
  return selections.map((selection) => {
    const title = candidateTitle(selection.candidates, selection.selectedIndex)
    const adopted = title ? `｜采用「${title}」` : ""
    return `- 批次 ${selection.selectionId.slice(-6)}｜${reviewLabel(selection.reviewStatus)}${adopted}`
  })
}

/** 灵感与健康度区。 */
export function formatStatusLines(data: Pick<EveningReportData, "inspirationCount" | "inspirationExtracted" | "inspirationFailed" | "hotSnapshotAt">): string[] {
  const lines = [
    `- 今日灵感：${data.inspirationCount} 条（已提取 ${data.inspirationExtracted}｜失败 ${data.inspirationFailed}）`,
  ]
  if (data.hotSnapshotAt) {
    const ageHours = Math.floor((Date.now() - data.hotSnapshotAt.getTime()) / 3_600_000)
    lines.push(`- 热点采集：正常（最近快照 ${ageHours} 小时前）`)
  } else {
    lines.push("- 热点采集：⚠️ 无快照，热点选题质量会受影响")
  }
  return lines
}

/** 空天也返回卡片（确认系统活着）；数据缺失时返回 null 由调用方决定跳过。 */
export function buildEveningReportCard(data: EveningReportData, projectName: string | null): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "今日选题晚报" },
      template: "indigo",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            projectName ? `**项目**：${projectName}` : "",
            `**今日选题**\n${formatSelectionLines(data.selections).join("\n")}`,
            `**今日动态**\n${formatStatusLines(data).join("\n")}`,
          ].filter(Boolean).join("\n\n"),
        },
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "早报提案、晚报对账；未裁决的批次明天仍可在控制台处理。",
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

export async function loadEveningReportData(userId: string): Promise<EveningReportData> {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const todayKey = new Date().toISOString().split("T")[0]

  const [selectionRows, inspirations, hotSnapshot] = await Promise.all([
    prisma.topicSelection.findMany({
      where: { userId, recommendationMode: "daily", recommendedDate: todayKey },
      orderBy: { createdAt: "asc" },
      select: { id: true, reviewStatus: true, selectedIndex: true, candidates: true },
    }),
    prisma.inspiration.findMany({
      where: { userId, createdAt: { gte: dayStart } },
      select: { aiStatus: true },
    }),
    prisma.douyinHotSnapshot.findFirst({
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    }),
  ])

  const selections: EveningSelectionSummary[] = selectionRows.map((row) => ({
    selectionId: row.id,
    reviewStatus: row.reviewStatus,
    selectedIndex: row.selectedIndex,
    candidates: row.candidates as unknown,
  }))

  return {
    selections,
    inspirationCount: inspirations.length,
    inspirationExtracted: inspirations.filter((item) => item.aiStatus === "completed").length,
    inspirationFailed: inspirations.filter((item) => item.aiStatus === "failed").length,
    hotSnapshotAt: hotSnapshot?.fetchedAt ?? null,
  }
}
