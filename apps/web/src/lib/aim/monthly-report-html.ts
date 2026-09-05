/**
 * 月度经营报告 HTML 渲染（WP-E · 对客户的一页式报告）。
 * 数据真源：computeMonthlyOperatingReport 聚合结果（ContentOutcome / OutcomeAttribution）。
 * 纪律：空值≠0；数据缺口显式列出；样本不足带标注；全字段转义。
 */

import { escapeHtml, formatMetric } from "@/lib/aim/retro-report-html"
import type { MonthlyOperatingReport } from "@/lib/aim/monthly-report"

export interface MonthlyReportHtmlInput {
  report: MonthlyOperatingReport
  projectName: string | null
  generatedAt: Date
}

function overviewCards(report: MonthlyOperatingReport): string {
  const cards: Array<{ label: string; value: string; hint?: string }> = [
    { label: "发布内容", value: String(report.publishedCount) },
    { label: "已回填数据", value: `${report.backfilledCount}/${report.publishedCount}` },
    { label: "播放合计", value: formatMetric(report.business.views) },
    { label: "有效线索", value: formatMetric(report.business.qualifiedLeadCount) },
    { label: "可追溯线索", value: String(report.attribution.traceableLeadCount) },
    { label: "来源不明线索", value: String(report.attribution.unknownLeadCount) },
    { label: "预约", value: formatMetric(report.business.appointmentCount) },
    { label: "成交", value: formatMetric(report.business.dealCount) },
    { label: "营收合计", value: formatMetric(report.business.revenue) },
  ]
  return cards
    .map(
      (card) =>
        `<div class="card"><div class="card-label">${escapeHtml(card.label)}</div><div class="card-value">${card.value}</div>${card.hint ? `<div class="card-hint">${escapeHtml(card.hint)}</div>` : ""}</div>`,
    )
    .join("")
}

function taskInsightTable(report: MonthlyOperatingReport): string {
  if (report.taskInsights.length === 0) {
    return '<p class="empty">本月无已发布内容，暂无按内容任务的归因聚合。</p>'
  }
  const rows = report.taskInsights
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.contentTask)}</td>
        <td>${row.publishedCount}</td>
        <td>${row.viewsTotal == null ? '<span class="empty">未回填</span>' : formatMetric(row.viewsTotal)}</td>
        <td>${row.traceableLeadCount}</td>
        <td>${row.unknownLeadCount}</td>
        <td>${row.sampleNote ? `<span class="note">${escapeHtml(row.sampleNote)}</span>` : "—"}</td>
      </tr>`,
    )
    .join("")
  return `<table>
    <thead><tr><th>内容任务</th><th>发布数</th><th>播放合计</th><th>可追溯线索</th><th>来源不明线索</th><th>样本说明</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note">播放为周期末最成熟快照（30&gt;14&gt;7 天）合计；线索按「挂到哪条内容」计；空值即未回填，不代表 0。</p>`
}

function dataNotesList(report: MonthlyOperatingReport): string {
  if (report.dataNotes.length === 0) {
    return '<p class="empty">本月无已知数据缺口。</p>'
  }
  const items = report.dataNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")
  return `<ul class="notes">${items}</ul>`
}

export function renderMonthlyReportHtml(input: MonthlyReportHtmlInput): string {
  const { report } = input
  const projectLine = input.projectName ? `项目：${escapeHtml(input.projectName)}` : report.projectId ? `项目 ID：${escapeHtml(report.projectId)}` : "范围：全部项目"
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>月度经营报告 · ${escapeHtml(report.month)}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #f6f7f9; color: #1f2329; }
  .page { max-width: 900px; margin: 0 auto; padding: 32px 20px 48px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e4e8; }
  .meta { color: #4e5561; font-size: 13px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
  .card { background: #fff; border: 1px solid #e2e4e8; border-radius: 8px; padding: 12px 14px; }
  .card-label { font-size: 12px; color: #4e5561; }
  .card-value { font-size: 20px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
  th, td { border: 1px solid #e2e4e8; padding: 6px 10px; text-align: left; }
  thead th { background: #f0f1f3; }
  .empty { color: #9aa0aa; }
  .note { color: #9aa0aa; font-size: 12px; }
  .notes { font-size: 13px; color: #8a4b08; }
  footer { margin-top: 36px; color: #9aa0aa; font-size: 12px; }
  @media (max-width: 640px) { .cards { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="page">
  <h1>月度经营报告 · ${escapeHtml(report.month)}</h1>
  <p class="meta">${projectLine} ｜ 内容 → 线索 → 成交 全链路可追溯视图</p>
  <h2>一、本月总览</h2>
  <div class="cards">${overviewCards(report)}</div>
  <h2>二、按内容任务的选题归因</h2>
  ${taskInsightTable(report)}
  <h2>三、数据缺口说明</h2>
  ${dataNotesList(report)}
  <footer>数据真源：ContentOutcome（7/14/30 累计快照）与 OutcomeAttribution（线索归因）｜ 由明动AIM 自动渲染于 ${escapeHtml(input.generatedAt.toISOString())} ｜ 本报告呈现事实数据，不构成效果承诺</footer>
</div>
</body>
</html>`
}
