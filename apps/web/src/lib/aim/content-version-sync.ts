import type { Prisma } from "@/generated/prisma/client"
import type { ContentFormat } from "@/lib/aim-generator"

export type AimGenerationContentColumn =
  | "videoScript"
  | "wechatArticle"
  | "momentsPost"
  | "communityMessage"
  | "shootingBrief"
  | "rawCopy"

/**
 * 把交付格式映射到 AimGeneration 宽表字段。
 * xiaohongshu_post 等无直落字段的格式返回 null（仅记版本，不改宽表）。
 */
export function contentFormatToGenerationColumn(
  format: string,
): AimGenerationContentColumn | null {
  switch (format as ContentFormat) {
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
    default:
      return null
  }
}

/**
 * 在同一事务内把正文写回 AimGeneration 当前字段，保证版本与真源一致。
 * 无对应宽表字段时静默跳过（版本行仍由调用方创建）。
 */
export async function syncAimGenerationContent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string
    generationId: string
    format: string
    content: string
  },
): Promise<{ column: AimGenerationContentColumn | null }> {
  const column = contentFormatToGenerationColumn(input.format)
  if (!column) return { column: null }

  const result = await tx.aimGeneration.updateMany({
    where: { id: input.generationId, userId: input.userId },
    data: { [column]: input.content },
  })
  if (result.count === 0) {
    throw new Error("GENERATION_NOT_FOUND")
  }
  return { column }
}

/**
 * 读取 AimGeneration 当前正文，用于首存时补 generated v1。
 */
export async function readAimGenerationContent(
  tx: Prisma.TransactionClient,
  input: { userId: string; generationId: string; format: string },
): Promise<string | null> {
  const column = contentFormatToGenerationColumn(input.format)
  if (!column) return null
  const row = await tx.aimGeneration.findFirst({
    where: { id: input.generationId, userId: input.userId },
    select: { [column]: true },
  })
  if (!row) return null
  const value = (row as Record<string, unknown>)[column]
  return typeof value === "string" && value.trim() ? value : null
}
