import type { ContentFormat } from "@/lib/api/client"
import { splitGenerationReasoning } from "@/lib/aim-generation-text"

/**
 * 历史读取归一化（用户指令唯一真源整改）：
 * 存量 AimGeneration 的内容列里混存着 [[AIM_METHOD_NOTE]] 思考依据；
 * 读取时统一拆分——内容列只返回可发布正文，思考依据放进 reasoningByFormat。
 * 不做数据库迁移：旧数据靠本函数在出参边界完成兼容。
 */

const CONTENT_COLUMN_BY_FORMAT: Partial<Record<ContentFormat, keyof AimGenerationContentColumns>> = {
  video_script: "videoScript",
  wechat_article: "wechatArticle",
  moments_post: "momentsPost",
  community_message: "communityMessage",
  shooting_brief: "shootingBrief",
  raw_copy: "rawCopy",
}

interface AimGenerationContentColumns {
  videoScript?: string | null
  wechatArticle?: string | null
  momentsPost?: string | null
  communityMessage?: string | null
  shootingBrief?: string | null
  rawCopy?: string | null
}

export function normalizeAimGenerationForRead<T extends AimGenerationContentColumns>(
  record: T,
): T & { reasoningByFormat: Partial<Record<ContentFormat, string>> } {
  const reasoningByFormat: Partial<Record<ContentFormat, string>> = {}
  const next = { ...record } as T & AimGenerationContentColumns
  for (const [format, column] of Object.entries(CONTENT_COLUMN_BY_FORMAT) as Array<
    [ContentFormat, keyof AimGenerationContentColumns]
  >) {
    const raw = record[column]
    if (typeof raw !== "string" || !raw.includes("[[AIM_METHOD_NOTE]]")) continue
    const parsed = splitGenerationReasoning(raw)
    if (parsed.reasoningSummary) reasoningByFormat[format] = parsed.reasoningSummary
    next[column] = parsed.content
  }
  return { ...next, reasoningByFormat }
}
