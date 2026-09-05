/**
 * 复盘记录写出飞书的字段构建（岗位卡：存数据库 + 同步飞书表格）。
 * 行级唯一键 = ContentOutcome.id，重复导出按行 upsert 不产生脏数据。
 * 纪律：未回填指标不写入内容摘要（空值≠0）。
 */

import type { DbLike } from "./shared"

const OUTCOME_METRIC_LABELS: Array<[string, string]> = [
  ["views", "播放"],
  ["likes", "点赞"],
  ["comments", "评论"],
  ["saves", "收藏"],
  ["shares", "分享"],
  ["qualifiedCommentCount", "有效评论"],
  ["dmCount", "私信"],
  ["qualifiedLeadCount", "有效线索"],
  ["appointmentCount", "预约"],
  ["dealCount", "成交"],
  ["revenue", "营收"],
]

function outcomeVerdictLabel(code: unknown): string {
  const labels: Record<string, string> = {
    excellent: "优秀",
    effective: "有效",
    neutral: "一般",
    ineffective: "无效",
    failed: "失败",
  }
  const key = typeof code === "string" ? code : ""
  return labels[key] ?? "已回填"
}

/** 复盘记录人话摘要：只列已回填指标（未回填项不列，空值≠0）。 */
function summarizeContentOutcome(outcome: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, label] of OUTCOME_METRIC_LABELS) {
    const value = outcome[key]
    if (value == null || value === "") continue
    const text = key === "revenue" ? `¥${String(value)}` : String(value)
    parts.push(`${label} ${text}`)
  }
  const head = `第${outcome.collectWindowDay}天累计快照（不相加）`
  const body = parts.length ? parts.join("｜") : "暂无已回填指标"
  return `${head}：${body}`
}

export async function buildLarkOutcomeExportFields(input: {
  db: DbLike
  userId: string
  resultId: string
  projectName: string
}): Promise<Record<string, unknown>> {
  const outcome = await input.db.contentOutcome?.findFirst({
    where: { id: input.resultId, userId: input.userId },
  })
  if (!outcome) throw new Error("复盘记录不存在")
  const generation = await input.db.aimGeneration?.findFirst({
    where: { id: String(outcome.generationId), userId: input.userId },
  })
  const generationTitle = String(generation?.topicTitle || generation?.rawInput || "AIM 内容").slice(0, 80)
  return {
    "标题": generationTitle,
    "内容": summarizeContentOutcome(outcome),
    "类型": "复盘记录",
    "状态": outcomeVerdictLabel(outcome.verdictCode),
    "AIM结果ID": input.resultId,
    "内容ID": String(outcome.generationId),
    "数据窗口": `第${outcome.collectWindowDay}天累计`,
    "项目名称": input.projectName,
  }
}
