/**
 * 多平台内容包契约（阶段 3）
 *
 * 存入 AimGeneration.taskSpec.contentPackage，不新增数据库表。
 * 确定性状态跟踪；不引入自主 Agent。
 */

import type { ContentFormat } from "@/lib/aim-generator"
import type { TaskSpec } from "@/lib/task-spec"

/** 计划首批正式支持的内容包格式（2—5 选） */
export const CONTENT_PACKAGE_FORMATS = [
  "video_script",
  "xiaohongshu_post",
  "wechat_article",
  "moments_post",
  "shooting_brief",
] as const satisfies readonly ContentFormat[]

export type ContentPackageFormat = (typeof CONTENT_PACKAGE_FORMATS)[number]

export const CONTENT_PACKAGE_FORMAT_LABELS: Record<ContentPackageFormat, string> = {
  video_script: "短视频口播",
  xiaohongshu_post: "小红书图文",
  wechat_article: "公众号文章",
  moments_post: "朋友圈文案",
  shooting_brief: "拍摄交接单",
}

/** 各平台最小差异约束（注入 prompt，禁止只换标题复制正文） */
export const CONTENT_PACKAGE_PLATFORM_CONSTRAINTS: Record<ContentPackageFormat, string> = {
  video_script:
    "【平台契约·口播】前 3 秒必须有钩子；全程口语可拍摄；节奏分明；只推动一个行动。禁止写成图文长文。",
  xiaohongshu_post:
    "【平台契约·小红书】必须有标题与分段；强调可读与收藏价值；注意平台风险表达；结构不可与口播逐句相同。",
  wechat_article:
    "【平台契约·公众号】长文结构+小标题；证据展开；结尾承接；不可只把口播加标题交差。",
  moments_post:
    "【平台契约·朋友圈】真人语气、场景感、短段落、弱推销；不可复制其他平台正文。",
  shooting_brief:
    "【平台契约·拍摄交接单】镜头/场景/道具/重点句/补拍要求必须具体可执行；不是文案改写。",
}

export interface ContentPackageFailedFormat {
  format: ContentFormat
  reason: string
}

export interface ContentPackageFormatMeta {
  format: ContentFormat
  model?: string
  totalTokens?: number
  durationMs?: number
}

export interface ContentPackageSpec {
  schemaVersion: 1
  canonicalGenerationId: string
  requestedFormats: ContentFormat[]
  completedFormats: ContentFormat[]
  failedFormats: ContentPackageFailedFormat[]
  knowledgeUsed: Array<{
    id: string
    title: string
    category: string
    categoryLabel?: string
    snippet?: string
  }>
  /** 无独立列的格式正文备份（如小红书），刷新可恢复 */
  artifacts?: Partial<Record<ContentFormat, string>>
  formatMeta?: ContentPackageFormatMeta[]
  updatedAt?: string
}

export function isContentPackageFormat(value: string): value is ContentPackageFormat {
  return (CONTENT_PACKAGE_FORMATS as readonly string[]).includes(value)
}

/**
 * @description 规范化一次内容包请求的格式列表（2—5，去重，仅首批格式）
 */
export function normalizeContentPackageFormats(
  formats: readonly string[],
  options?: { min?: number; max?: number },
): ContentPackageFormat[] {
  const min = options?.min ?? 1
  const max = options?.max ?? 5
  const seen = new Set<string>()
  const result: ContentPackageFormat[] = []
  for (const raw of formats) {
    const format = raw === "koubo_script" ? "video_script" : raw
    if (!isContentPackageFormat(format) || seen.has(format)) continue
    seen.add(format)
    result.push(format)
    if (result.length >= max) break
  }
  return result.length >= min ? result : result
}

/**
 * @description 根据解析结果构建/合并内容包状态（空内容记失败）
 */
export function buildContentPackageSpec(input: {
  canonicalGenerationId: string
  requestedFormats: readonly ContentFormat[]
  parsed: Partial<Record<ContentFormat, string | undefined>>
  knowledgeUsed?: Array<{
    id: string
    title: string
    category: string
    categoryLabel?: string
    snippet?: string
  }>
  previous?: ContentPackageSpec | null
  model?: string
  totalTokens?: number
  durationMs?: number
  now?: string
}): ContentPackageSpec {
  const requested = normalizeContentPackageFormats(input.requestedFormats, { min: 1, max: 8 })
  const completed: ContentFormat[] = []
  const failed: ContentPackageFailedFormat[] = []
  const artifacts: Partial<Record<ContentFormat, string>> = {
    ...(input.previous?.artifacts ?? {}),
  }

  for (const format of requested) {
    const content = (input.parsed[format] ?? "").trim()
    if (content.length >= 20) {
      completed.push(format)
      // 无独立 DB 列的格式写入 artifacts；口播已归一为 video_script（有列）
      if (format === "xiaohongshu_post") {
        artifacts[format] = content
      }
      // 清除同格式历史失败
    } else {
      failed.push({
        format,
        reason: content
          ? "内容过短，未达到可发布最小长度"
          : "该格式未生成有效正文，可单独重试",
      })
    }
  }

  const prevCompleted = (input.previous?.completedFormats ?? []).filter(
    (format) => !requested.includes(format as ContentPackageFormat),
  )
  const prevFailed = (input.previous?.failedFormats ?? []).filter(
    (item) => !requested.includes(item.format as ContentPackageFormat) && !completed.includes(item.format),
  )

  const completedFormats = [...new Set([...prevCompleted, ...completed])]
  const failedFormats = [
    ...prevFailed.filter((item) => !completedFormats.includes(item.format)),
    ...failed,
  ]

  const formatMeta: ContentPackageFormatMeta[] = [
    ...(input.previous?.formatMeta ?? []).filter((item) => !requested.includes(item.format as ContentPackageFormat)),
    ...requested.map((format) => ({
      format,
      model: input.model,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs,
    })),
  ]

  return {
    schemaVersion: 1,
    canonicalGenerationId: input.canonicalGenerationId,
    requestedFormats: [
      ...new Set([
        ...(input.previous?.requestedFormats ?? []),
        ...requested,
      ]),
    ],
    completedFormats,
    failedFormats,
    knowledgeUsed: input.knowledgeUsed ?? input.previous?.knowledgeUsed ?? [],
    artifacts: Object.keys(artifacts).length > 0 ? artifacts : undefined,
    formatMeta,
    updatedAt: input.now ?? new Date().toISOString(),
  }
}

/**
 * @description 组装多格式平台契约 prompt 块
 */
export function buildContentPackageConstraintBlock(formats: readonly ContentFormat[]): string {
  const lines = formats
    .filter(isContentPackageFormat)
    .map((format) => CONTENT_PACKAGE_PLATFORM_CONSTRAINTS[format])
  if (lines.length === 0) return ""
  return [
    "【内容包平台契约】",
    "必须为每个请求格式输出独立正文，禁止复制同一正文只换标题。",
    "共享同一母内容的核心观点与证据，但结构、长度、表达必须按平台改写。",
    ...lines,
  ].join("\n")
}

export function parseContentPackageSpec(value: unknown): ContentPackageSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1) return null
  if (typeof input.canonicalGenerationId !== "string" || !input.canonicalGenerationId.trim()) return null
  const requestedFormats = Array.isArray(input.requestedFormats)
    ? input.requestedFormats.filter((item): item is string => typeof item === "string")
    : []
  const completedFormats = Array.isArray(input.completedFormats)
    ? input.completedFormats.filter((item): item is string => typeof item === "string")
    : []
  const failedFormats = Array.isArray(input.failedFormats)
    ? input.failedFormats
        .filter((item): item is ContentPackageFailedFormat => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false
          const row = item as Record<string, unknown>
          return typeof row.format === "string" && typeof row.reason === "string"
        })
        .map((item) => ({ format: item.format, reason: item.reason.slice(0, 300) }))
    : []

  return {
    schemaVersion: 1,
    canonicalGenerationId: input.canonicalGenerationId.trim(),
    requestedFormats: requestedFormats as ContentFormat[],
    completedFormats: completedFormats as ContentFormat[],
    failedFormats,
    knowledgeUsed: Array.isArray(input.knowledgeUsed)
      ? input.knowledgeUsed
          .filter((item): item is {
            id: string
            title: string
            category: string
            categoryLabel?: string
            snippet?: string
          } => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return false
            const row = item as Record<string, unknown>
            return typeof row.id === "string" && typeof row.title === "string"
          })
          .map((item) => ({
            id: item.id,
            title: item.title,
            category: typeof item.category === "string" ? item.category : "unknown",
            ...(typeof item.categoryLabel === "string" ? { categoryLabel: item.categoryLabel } : {}),
            ...(typeof item.snippet === "string" ? { snippet: item.snippet } : {}),
          }))
      : [],
    artifacts:
      input.artifacts && typeof input.artifacts === "object" && !Array.isArray(input.artifacts)
        ? (input.artifacts as Partial<Record<ContentFormat, string>>)
        : undefined,
    formatMeta: Array.isArray(input.formatMeta)
      ? (input.formatMeta as ContentPackageFormatMeta[])
      : undefined,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : undefined,
  }
}

export function getContentPackageFromTaskSpec(taskSpec: unknown): ContentPackageSpec | null {
  if (!taskSpec || typeof taskSpec !== "object" || Array.isArray(taskSpec)) return null
  return parseContentPackageSpec((taskSpec as { contentPackage?: unknown }).contentPackage)
}

export function withContentPackageOnTaskSpec(
  taskSpec: TaskSpec,
  contentPackage: ContentPackageSpec,
): TaskSpec {
  return { ...taskSpec, contentPackage }
}

/**
 * @description AimGeneration 宽表可直接落库的格式
 */
export function contentFormatToColumn(
  format: ContentFormat,
): "videoScript" | "wechatArticle" | "momentsPost" | "communityMessage" | "shootingBrief" | "rawCopy" | null {
  switch (format) {
    case "video_script":
    case "koubo_script":
      return "videoScript"
    case "wechat_article":
      return "wechatArticle"
    case "moments_post":
      return "momentsPost"
    case "community_message":
      return "communityMessage"
    case "shooting_brief":
      return "shootingBrief"
    case "raw_copy":
      return "rawCopy"
    case "xiaohongshu_post":
      return null
    default:
      return null
  }
}
