/**
 * HTML 复盘报告渲染器（岗位卡·数据复盘官·输出 2 展示层）。
 * 数据真源：ContentOutcome（7/14/30 累计快照，不相加）+ OutcomeAttribution + retroSnapshots。
 * 纪律：空值≠0（未回填显示「未回填」）；未登记归因显式说明；全字段 HTML 转义，不夸大缺失。
 */

export interface RetroReportGenerationMeta {
  id: string
  topicTitle: string | null
  rawInput: string | null
  workflowStatus: string
  publishPlatform: string | null
  publishUrl: string | null
  publishedAt: Date | null
  createdAt: Date
}

export interface RetroReportOutcomeRow {
  collectWindowDay: number
  collectedAt: Date
  platform: string | null
  views: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  qualifiedCommentCount: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
  verdictCode: string | null
  verdictNote: string | null
  audienceFeedback: string | null
}

export interface RetroReportAttributionRow {
  externalLeadId: string
  attributionMethod: string
  externalDealId: string | null
  externalPaymentId: string | null
  occurredAt: Date
}

export interface RetroReportSnapshotRow {
  summary: string
  actualData?: string
  verdict?: string
  nextRule?: string
  createdAt?: string
}

export interface RetroReportData {
  generation: RetroReportGenerationMeta
  outcomes: RetroReportOutcomeRow[]
  attributions: RetroReportAttributionRow[]
  retroSnapshots: RetroReportSnapshotRow[]
  generatedAt: Date
}

const WORKFLOW_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  ready_to_shoot: "待拍摄",
  shooting: "拍摄中",
  editing: "剪辑中",
  ready_to_publish: "待发布",
  published: "已发布",
  archived: "已归档",
}

const VERDICT_CODE_LABELS: Record<string, string> = {
  excellent: "优秀",
  effective: "有效",
  neutral: "一般",
  ineffective: "无效",
  failed: "失败",
}

const ATTRIBUTION_METHOD_LABELS: Record<string, string> = {
  explicit: "明确归因",
  first_touch: "首触归因",
  unknown: "来源不明",
}

const SIGNAL_METRICS: Array<{ key: keyof RetroReportOutcomeRow; label: string }> = [
  { key: "views", label: "播放" },
  { key: "likes", label: "点赞" },
  { key: "comments", label: "评论" },
  { key: "saves", label: "收藏" },
  { key: "shares", label: "分享" },
]

const BUSINESS_METRICS: Array<{ key: keyof RetroReportOutcomeRow; label: string }> = [
  { key: "qualifiedCommentCount", label: "有效评论" },
  { key: "dmCount", label: "私信" },
  { key: "qualifiedLeadCount", label: "有效线索" },
  { key: "appointmentCount", label: "预约" },
  { key: "dealCount", label: "成交" },
  { key: "revenue", label: "成交金额" },
]

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** 空值显示「未回填」，合法 0 显示 0 —— 空值≠0 纪律的展示层落点。 */
export function formatMetric(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '<span class="empty">未回填</span>'
  return value.toLocaleString("zh-CN")
}

function formatDate(value: Date | string | null | undefined): string {
  if (value == null) return '<span class="empty">未回填</span>'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '<span class="empty">时间无效</span>'
  return escapeHtml(date.toISOString().slice(0, 10))
}

function workflowStatusLabel(status: string): string {
  return WORKFLOW_STATUS_LABELS[status] ?? status
}

function verdictLabel(code: string | null): string {
  if (!code) return '<span class="empty">未判断</span>'
  return VERDICT_CODE_LABELS[code] ?? code
}

const ALL_METRICS = [...SIGNAL_METRICS, ...BUSINESS_METRICS]

function renderOutcomeTable(outcomes: RetroReportOutcomeRow[]): string {
  if (outcomes.length === 0) {
    return '<p class="empty">尚无已回填的发布数据（7/14/30 天窗口均为空）。请通过「填写复盘」或粘贴/上传平台导出数据回填。</p>'
  }
  const head = ALL_METRICS.map((metric) => `<th>${escapeHtml(metric.label)}</th>`).join("")
  const rows = outcomes
    .map((outcome) => {
      const cells = ALL_METRICS.map((metric) => `<td>${formatMetric(outcome[metric.key] as number | null)}</td>`).join("")
      return `<tr><th>第 ${outcome.collectWindowDay} 天（累计快照）</th>${cells}</tr>`
    })
    .join("")
  return `<table><thead><tr><th>窗口</th>${head}</tr></thead><tbody>${rows}</tbody></table>`
}

function renderAttributionSection(attributions: RetroReportAttributionRow[]): string {
  if (attributions.length === 0) {
    return '<p class="empty">未登记线索归因。加微/进线/预约时请在内容卡片「登记线索」挂来源，缺省即来源不明，禁止猜测补齐。</p>'
  }
  const rows = attributions
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.externalLeadId)}</td>
        <td>${escapeHtml(ATTRIBUTION_METHOD_LABELS[row.attributionMethod] ?? row.attributionMethod)}</td>
        <td>${row.externalDealId ? escapeHtml(row.externalDealId) : '<span class="empty">未挂</span>'}</td>
        <td>${row.externalPaymentId ? escapeHtml(row.externalPaymentId) : '<span class="empty">未挂</span>'}</td>
        <td>${formatDate(row.occurredAt)}</td>
      </tr>`,
    )
    .join("")
  return `<table><thead><tr><th>线索标识</th><th>归因方式</th><th>成交记录</th><th>回款记录</th><th>发生日期</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderSnapshotSection(snapshots: RetroReportSnapshotRow[]): string {
  if (snapshots.length === 0) {
    return '<p class="empty">尚未生成复盘结论。可在复盘对话中由数据复盘官生成四段式结论。</p>'
  }
  // 存储为追加式（旧在前）；展示倒序，最新复盘在最上，编号沿用原始次序。
  return [...snapshots]
    .map((snapshot, index) => ({ snapshot, no: index + 1 }))
    .reverse()
    .map(({ snapshot, no }) => {
      const parts: string[] = [`<h3>第 ${no} 次复盘 · ${escapeHtml(snapshot.createdAt ?? "")}</h3>`]
      parts.push(`<p><strong>复盘结论：</strong>${escapeHtml(snapshot.summary) || '<span class="empty">（空）</span>'}</p>`)
      if (snapshot.actualData) parts.push(`<p><strong>实际数据：</strong>${escapeHtml(snapshot.actualData)}</p>`)
      if (snapshot.verdict) parts.push(`<p><strong>判断：</strong>${escapeHtml(snapshot.verdict)}</p>`)
      if (snapshot.nextRule) parts.push(`<p><strong>下一步规则：</strong>${escapeHtml(snapshot.nextRule)}</p>`)
      return `<article class="snapshot">${parts.join("")}</article>`
    })
    .join("")
}

/** 纯函数：结构化数据 → 完整 HTML 文档。不请求、不落库。 */
export function renderRetroReportHtml(data: RetroReportData): string {
  const { generation } = data
  const title = generation.topicTitle?.trim() || generation.rawInput?.trim().slice(0, 80) || `内容 ${generation.id}`
  const publishLine = [
    `状态：<strong>${escapeHtml(workflowStatusLabel(generation.workflowStatus))}</strong>`,
    `平台：${generation.publishPlatform ? escapeHtml(generation.publishPlatform) : '<span class="empty">未登记</span>'}`,
    `发布日期：${formatDate(generation.publishedAt)}`,
  ].join(" ｜ ")
  const publishLink = generation.publishUrl
    ? `<p>作品链接：<a href="${escapeHtml(generation.publishUrl)}" target="_blank" rel="noreferrer">${escapeHtml(generation.publishUrl)}</a></p>`
    : ""

  const latestVerdict = data.outcomes[data.outcomes.length - 1] ?? null

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>复盘报告 · ${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #f6f7f9; color: #1f2329; }
  .page { max-width: 860px; margin: 0 auto; padding: 32px 20px 48px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  h2 { font-size: 16px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e4e8; }
  h3 { font-size: 14px; margin: 12px 0 4px; color: #4e5561; }
  .meta { color: #4e5561; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
  th, td { border: 1px solid #e2e4e8; padding: 6px 10px; text-align: left; }
  thead th { background: #f0f1f3; }
  tbody th { background: #fafbfc; font-weight: 500; white-space: nowrap; }
  .empty { color: #9aa0aa; }
  .snapshot { background: #fff; border: 1px solid #e2e4e8; border-radius: 8px; padding: 12px 16px; margin: 10px 0; font-size: 14px; }
  footer { margin-top: 36px; color: #9aa0aa; font-size: 12px; }
  a { color: #3370ff; word-break: break-all; }
</style>
</head>
<body>
<div class="page">
  <h1>复盘报告 · ${escapeHtml(title)}</h1>
  <p class="meta">${publishLine}</p>
  ${publishLink}
  ${latestVerdict ? `<p class="meta">用户判断：${verdictLabel(latestVerdict.verdictCode)}${latestVerdict.verdictNote ? ` · ${escapeHtml(latestVerdict.verdictNote)}` : ""}</p>` : ""}
  ${latestVerdict?.audienceFeedback ? `<p class="meta">观众反馈：${escapeHtml(latestVerdict.audienceFeedback)}</p>` : ""}
  <h2>一、发布数据（7 / 14 / 30 天累计快照，不相加）</h2>
  ${renderOutcomeTable(data.outcomes)}
  <h2>二、线索归因</h2>
  ${renderAttributionSection(data.attributions)}
  <h2>三、复盘结论</h2>
  ${renderSnapshotSection(data.retroSnapshots)}
  <footer>数据真源：ContentOutcome / OutcomeAttribution / 复盘快照 ｜ 由明动AIM 自动渲染于 ${escapeHtml(data.generatedAt.toISOString())} ｜ 空值即未回填，不代表 0</footer>
</div>
</body>
</html>`
}
