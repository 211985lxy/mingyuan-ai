/**
 * 把抖音/视频号等平台导出文档（粘贴纯文本）抽成 ContentOutcome 字段。
 * 认不出就失败可见；禁止瞎填。未出现的字段保持 undefined（≠ 0）。
 */

export type AnalyticsCollectWindow = 7 | 14 | 30

export interface ParsedPlatformAnalytics {
  /** 至少抽出一个数字字段才算成功 */
  ok: boolean
  platform: string | null
  collectWindowDay: AnalyticsCollectWindow
  confidence: "high" | "medium" | "low"
  /** 仅包含解析到的字段；未出现的键不写入，留给 upsert 合并 */
  fields: {
    views?: number
    likes?: number
    comments?: number
    saves?: number
    shares?: number
    dmCount?: number
    qualifiedLeadCount?: number
    qualifiedCommentCount?: number
    appointmentCount?: number
    dealCount?: number
    revenue?: number
  }
  /** 人话说明：抽到了什么、缺什么 */
  summary: string
  missingHints: string[]
  rawSnippet: string
}

type MetricKey = keyof ParsedPlatformAnalytics["fields"]

const METRIC_PATTERNS: Array<{ key: MetricKey; labels: RegExp }> = [
  { key: "views", labels: /播放量|播放次数|播放数|观看量|观看次数|曝光量|阅读数|阅读量|完播前播放|视频播放/ },
  { key: "likes", labels: /点赞数|点赞量|获赞|喜欢数|点赞(?!\w)|赞\s*[：:]/ },
  { key: "comments", labels: /评论数|评论量|留言数|评论(?!\w)/ },
  { key: "saves", labels: /收藏数|收藏量|收藏次数|加收藏|收藏(?!\w)/ },
  { key: "shares", labels: /分享数|分享量|转发数|转发量|推荐数|分享(?!\w)|转发(?!\w)/ },
  { key: "dmCount", labels: /私信数|私信量|私信人数|主动私信|收到私信/ },
  { key: "qualifiedLeadCount", labels: /有效线索|线索数|留资数|表单提交|咨询线索/ },
  { key: "qualifiedCommentCount", labels: /有效评论|意向评论/ },
  { key: "appointmentCount", labels: /预约数|预约量|约课数|到店预约/ },
  { key: "dealCount", labels: /成交单|成交数|成交量|成交笔|订单数/ },
  { key: "revenue", labels: /营收|成交额|销售额|GMV|实收/ },
]

const WINDOW_PATTERN = /(?:近|过去|统计|数据)?\s*(7|14|30)\s*天|(\d+)\s*日窗口/

function normalizeDigits(raw: string): string {
  return raw
    .replace(/,/g, "")
    .replace(/，/g, "")
    .replace(/\s+/g, "")
}

/** 解析「1.2万」「3w」「12000」「12,000」；空串返回 null（未填写），合法 0 返回 0。 */
export function parseAnalyticsNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  const text = normalizeDigits(String(raw).trim())
  if (!text || text === "-" || text === "—" || text === "无" || text === "暂无") return null

  const wan = text.match(/^(-?\d+(?:\.\d+)?)(万|w|W)$/)
  if (wan) {
    const n = Number(wan[1])
    if (!Number.isFinite(n)) return null
    return Math.round(n * 10_000)
  }

  const yi = text.match(/^(-?\d+(?:\.\d+)?)(亿)$/)
  if (yi) {
    const n = Number(yi[1])
    if (!Number.isFinite(n)) return null
    return Math.round(n * 100_000_000)
  }

  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const n = Number(text)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function guessPlatform(text: string): string | null {
  if (/抖音|douyin|抖音创作者/i.test(text)) return "douyin"
  if (/视频号|channels\.weixin|微信视频/i.test(text)) return "channels"
  if (/小红书|xiaohongshu|xhs/i.test(text)) return "xiaohongshu"
  if (/快手|kuaishou/i.test(text)) return "kuaishou"
  if (/B站|哔哩哔哩|bilibili/i.test(text)) return "bilibili"
  return null
}

function guessWindow(text: string): AnalyticsCollectWindow {
  const m = text.match(WINDOW_PATTERN)
  if (m) {
    const day = Number(m[1] || m[2])
    if (day === 7 || day === 14 || day === 30) return day
  }
  return 7
}

function extractMetric(text: string, labels: RegExp): number | undefined {
  // 「标签：数字」或「标签 数字」；数字可带万/w
  const re = new RegExp(
    `(?:${labels.source})[^\\d\\n]{0,12}(-?\\d[\\d,，.]*(?:万|亿|w|W)?)`,
    "i",
  )
  const match = text.match(re)
  if (!match) return undefined
  const value = parseAnalyticsNumber(match[1])
  return value === null ? undefined : value
}

function buildSummary(input: {
  ok: boolean
  platform: string | null
  collectWindowDay: AnalyticsCollectWindow
  fields: ParsedPlatformAnalytics["fields"]
  missingHints: string[]
}): string {
  if (!input.ok) {
    return "没有识别到可用的发布数据字段。请粘贴含播放/点赞/评论等数字的导出文档，或改用「填写复盘」手工录入。"
  }
  const parts: string[] = []
  if (input.platform) parts.push(`平台 ${input.platform}`)
  parts.push(`${input.collectWindowDay} 天窗口`)
  const metrics = Object.entries(input.fields)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${k}=${v}`)
  if (metrics.length) parts.push(`已识别 ${metrics.join("、")}`)
  if (input.missingHints.length) parts.push(`未识别：${input.missingHints.join("、")}`)
  return parts.join("｜")
}

/**
 * 解析平台导出/后台复制的纯文本。
 * 至少一个内容信号或商业结果数字才算 ok。
 */
export function parsePlatformAnalyticsText(raw: string): ParsedPlatformAnalytics {
  const text = raw.trim()
  const rawSnippet = text.slice(0, 240)
  if (!text) {
    return {
      ok: false,
      platform: null,
      collectWindowDay: 7,
      confidence: "low",
      fields: {},
      summary: "粘贴内容为空。",
      missingHints: ["播放", "点赞", "评论"],
      rawSnippet: "",
    }
  }

  const platform = guessPlatform(text)
  const collectWindowDay = guessWindow(text)
  const fields: ParsedPlatformAnalytics["fields"] = {}
  const foundLabels: string[] = []

  for (const { key, labels } of METRIC_PATTERNS) {
    const value = extractMetric(text, labels)
    if (value === undefined) continue
    fields[key] = value
    foundLabels.push(key)
  }

  const ok = foundLabels.length > 0
  const labelByKey: Record<"views" | "likes" | "comments", string> = {
    views: "播放",
    likes: "点赞",
    comments: "评论",
  }
  const coreMissing = (["views", "likes", "comments"] as const)
    .filter((k) => fields[k] === undefined)
    .map((k) => labelByKey[k])

  let confidence: ParsedPlatformAnalytics["confidence"] = "low"
  if (foundLabels.length >= 4 && platform) confidence = "high"
  else if (foundLabels.length >= 2) confidence = "medium"

  const missingHints: string[] = ok ? coreMissing : ["播放", "点赞", "评论", "或其他经营数字"]

  return {
    ok,
    platform,
    collectWindowDay,
    confidence,
    fields,
    summary: buildSummary({ ok, platform, collectWindowDay, fields, missingHints }),
    missingHints,
    rawSnippet,
  }
}

/** 转成 upsertContentOutcome 可用的请求体（只带识别到的字段）。 */
export function parsedAnalyticsToOutcomeInput(
  parsed: ParsedPlatformAnalytics,
): Record<string, unknown> | null {
  if (!parsed.ok) return null
  return {
    collectWindowDay: parsed.collectWindowDay,
    ...(parsed.platform ? { platform: parsed.platform } : {}),
    ...parsed.fields,
  }
}
