/**
 * 创作者数据总线（飞书）读取与聚合。
 *
 * 数据源是上游开源工具 data-scientist-community 在用户自己的飞书里自动创建的
 * 多维表格（表结构由其 scripts/domain/feishu_schema.py 单一事实源定义，本模块只读）。
 * 读取走 lark-base 既有 CLI 通道，bot 身份需要用户把该表共享给 AIM 机器人。
 *
 * 语义注意：`平台明细V2` 按 `平台作品键` upsert 且会清理缺失记录，是「当前值」而非
 * 追加快照；因此周期汇总的指标含义是「周期内发布作品的当前累计值」，不是周期内新增
 * 播放。增量趋势由上游 `作品增量表` 承担（P2 接入）。
 *
 * 降级原则（生产零假数据）：未配置返回 not_configured；读取失败返回 error 并带
 * 可行动 message；部分失败（如同步日志表不可读）以 warnings 显式暴露，不静默吞掉。
 */

export type CreatorPlatform = "douyin" | "xiaohongshu" | "bilibili" | "kuaishou" | "other"

export type CreatorPostQuality = {
  completionRate: number | null
  likeRate: number | null
  commentRate: number | null
  shareRate: number | null
  collectRate: number | null
  coverClickRate: number | null
  bounceRate3s: number | null
}

export type CreatorPostMetric = {
  recordId: string
  postId: string
  platform: CreatorPlatform
  platformLabel: string
  title: string
  publishedAt: string | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  collects: number | null
  followersDelta: number | null
  quality: CreatorPostQuality
}

export type CreatorPlatformTotal = {
  platform: CreatorPlatform
  label: string
  posts: number
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  collects: number | null
}

export type CreatorMetricsResponse =
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string }
  | {
      status: "ok"
      fetchedAt: string
      /** 同步日志V2 最新批次的同步时间；未配置日志表或读取失败时为 null（见 warnings） */
      lastSyncedAt: string | null
      posts: CreatorPostMetric[]
      skipped: number
      warnings: string[]
      period: {
        start: string
        end: string
        /** 周期内发布的作品数与其当前累计指标（非周期内新增） */
        publishedCount: number
        views: number | null
        interactions: number | null
      }
      platformTotals: CreatorPlatformTotal[]
    }

export type CreatorMetricsConfig = {
  baseToken: string
  detailTableId: string
  syncLogTableId?: string
  cliPath?: string
}

export type EnvSource = Record<string, string | undefined>

type ListRecordsInput = {
  baseToken: string
  tableId: string
  limit?: number
  offset?: number
  cliPath?: string
  identity?: "user" | "bot"
}
type ListRecordsFn = (input: ListRecordsInput) => Promise<Array<{ recordId: string; fields: Record<string, unknown> }>>

const NOT_CONFIGURED_MESSAGE =
  "未配置创作者数据总线的飞书 Base。请先在用户本机运行上游采集工具并同步到飞书，" +
  "再设置 LARK_CREATOR_METRICS_BASE_TOKEN、LARK_CREATOR_METRICS_DETAIL_TABLE_ID" +
  "（可选 LARK_CREATOR_METRICS_SYNC_LOG_TABLE_ID），并把该表共享给 AIM 机器人账号。"

const MAX_RECORDS = 500
const PAGE_SIZE = 100

const PLATFORM_BY_LABEL: Record<string, CreatorPlatform> = {
  抖音: "douyin",
  小红书: "xiaohongshu",
  "B站": "bilibili",
  快手: "kuaishou",
}

export function readCreatorMetricsConfig(source: EnvSource): CreatorMetricsConfig | null {
  const baseToken = source.LARK_CREATOR_METRICS_BASE_TOKEN?.trim()
  const detailTableId = source.LARK_CREATOR_METRICS_DETAIL_TABLE_ID?.trim()
  if (!baseToken || !detailTableId) return null
  return {
    baseToken,
    detailTableId,
    syncLogTableId: source.LARK_CREATOR_METRICS_SYNC_LOG_TABLE_ID?.trim() || undefined,
    cliPath: source.LARK_CLI_PATH?.trim() || undefined,
  }
}

function pickNumber(fields: Record<string, unknown>, name: string): number | null {
  const value = fields[name]
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,，\s]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** 位表日期字段常见毫秒时间戳；兼容数字字符串与 ISO 文本。 */
function pickDate(fields: Record<string, unknown>, name: string): string | null {
  const value = fields[name]
  if (value == null || value === "") return null
  const ms = typeof value === "number" ? value : Number(String(value))
  const date = Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function pickText(fields: Record<string, unknown>, name: string): string {
  const value = fields[name]
  if (value == null) return ""
  const text = Array.isArray(value) ? value.map((item) => String(item)).join(" ") : String(value)
  return text.trim()
}

/** 上游 schema 字段名为稳定契约（feishu_schema.py），此处只认正名、不做猜测性别名。 */
export function mapDetailRecord(item: { recordId: string; fields: Record<string, unknown> }): CreatorPostMetric | null {
  const fields = item.fields
  const postId = pickText(fields, "平台作品键")
  if (!postId) return null
  const platformLabel = pickText(fields, "视频平台") || "其他"
  return {
    recordId: item.recordId,
    postId,
    platform: PLATFORM_BY_LABEL[platformLabel] ?? "other",
    platformLabel,
    title: pickText(fields, "视频标题") || "(无标题)",
    publishedAt: pickDate(fields, "视频发布日期"),
    views: pickNumber(fields, "总流量"),
    likes: pickNumber(fields, "点赞量"),
    comments: pickNumber(fields, "评论量"),
    shares: pickNumber(fields, "分享量"),
    collects: pickNumber(fields, "收藏量"),
    followersDelta: pickNumber(fields, "涨粉量"),
    quality: {
      completionRate: pickNumber(fields, "完播率"),
      likeRate: pickNumber(fields, "点赞率"),
      commentRate: pickNumber(fields, "评论率"),
      shareRate: pickNumber(fields, "分享率"),
      collectRate: pickNumber(fields, "收藏率"),
      coverClickRate: pickNumber(fields, "封标点击率"),
      bounceRate3s: pickNumber(fields, "3s跳出率"),
    },
  }
}

function sumNullable(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value != null)
  return usable.length > 0 ? usable.reduce((acc, value) => acc + value, 0) : null
}

function buildPlatformTotals(posts: CreatorPostMetric[]): CreatorPlatformTotal[] {
  const groups = new Map<string, CreatorPostMetric[]>()
  for (const post of posts) {
    const bucket = groups.get(post.platformLabel)
    if (bucket) bucket.push(post)
    else groups.set(post.platformLabel, [post])
  }
  return [...groups.entries()]
    .map(([label, bucket]) => ({
      platform: PLATFORM_BY_LABEL[label] ?? "other",
      label,
      posts: bucket.length,
      views: sumNullable(bucket.map((post) => post.views)),
      likes: sumNullable(bucket.map((post) => post.likes)),
      comments: sumNullable(bucket.map((post) => post.comments)),
      shares: sumNullable(bucket.map((post) => post.shares)),
      collects: sumNullable(bucket.map((post) => post.collects)),
    }))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || b.posts - a.posts)
}

async function listAllRecords(config: CreatorMetricsConfig, tableId: string, listRecords: ListRecordsFn) {
  const rows: Array<{ recordId: string; fields: Record<string, unknown> }> = []
  for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
    const page = await listRecords({
      baseToken: config.baseToken,
      tableId,
      limit: PAGE_SIZE,
      offset,
      cliPath: config.cliPath,
      identity: "bot",
    })
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return rows
}

async function readLastSyncedAt(
  config: CreatorMetricsConfig,
  listRecords: ListRecordsFn,
  warnings: string[],
): Promise<string | null> {
  if (!config.syncLogTableId) return null
  try {
    const rows = await listAllRecords(config, config.syncLogTableId, listRecords)
    const dates = rows
      .map((row) => pickDate(row.fields, "同步日期"))
      .filter((value): value is string => value != null)
      .sort()
    return dates.length > 0 ? dates[dates.length - 1] : null
  } catch (error) {
    warnings.push(`同步日志表读取失败，无法判断数据新鲜度：${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export async function fetchCreatorMetrics(input: {
  env?: EnvSource
  start: Date
  end: Date
  listRecords?: ListRecordsFn
  fetchedAt?: Date
}): Promise<CreatorMetricsResponse> {
  const config = readCreatorMetricsConfig(input.env ?? process.env)
  if (!config) return { status: "not_configured", message: NOT_CONFIGURED_MESSAGE }

  const listRecords = input.listRecords ?? (await import("@/lib/lark-base")).listLarkBaseRecords
  const warnings: string[] = []
  try {
    const [rows, lastSyncedAt] = await Promise.all([
      listAllRecords(config, config.detailTableId, listRecords),
      readLastSyncedAt(config, listRecords, warnings),
    ])

    const posts: CreatorPostMetric[] = []
    let skipped = 0
    for (const row of rows) {
      const mapped = mapDetailRecord(row)
      if (mapped) posts.push(mapped)
      else skipped += 1
    }
    posts.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))

    const startMs = input.start.getTime()
    const endMs = input.end.getTime()
    const inPeriod = posts.filter((post) => {
      if (!post.publishedAt) return false
      const ms = new Date(post.publishedAt).getTime()
      return ms >= startMs && ms < endMs
    })
    const period = {
      start: input.start.toISOString(),
      end: input.end.toISOString(),
      publishedCount: inPeriod.length,
      views: sumNullable(inPeriod.map((post) => post.views)),
      interactions: sumNullable(
        inPeriod.flatMap((post) => [post.likes, post.comments, post.shares, post.collects]),
      ),
    }

    return {
      status: "ok",
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      lastSyncedAt,
      posts,
      skipped,
      warnings,
      period,
      platformTotals: buildPlatformTotals(posts),
    }
  } catch (error) {
    return {
      status: "error",
      message: `读取创作者数据总线失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
