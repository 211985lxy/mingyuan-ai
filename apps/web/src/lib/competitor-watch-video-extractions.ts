import { prisma } from "@/lib/prisma"
import {
  createVideoCopyExtraction,
  serializeVideoCopyExtraction,
} from "@/lib/video-copy-extractions"
import { assertSupportedVideoUrl } from "@/lib/video-text-extractor"
import { resolveBoundProject } from "@/lib/account-project-context"

type DbLike = Pick<typeof prisma, "watchAccount" | "videoCopyExtraction">

/** 对标账号视频文案提取：账号归属与去重都以“账号绑定项目”为边界。 */
async function watchExtractionProjectScope(
  userId: string,
  projectId?: string | null,
): Promise<string | null> {
  if (projectId) return projectId
  try {
    return (await resolveBoundProject({ userId })).id
  } catch {
    return null
  }
}

/**
 * @description 创建watchvideoextraction
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function createWatchVideoExtraction(input: {
  userId: string
  watchAccountId: string
  videoUrl: string
  /** 路由入口解析后的绑定项目；缺省时以账号绑定为准。 */
  projectId?: string
  db?: DbLike
  createExtraction?: typeof createVideoCopyExtraction
}) {
  const db = input.db ?? prisma
  const sourceUrl = assertSupportedVideoUrl(input.videoUrl)
  const scope = await watchExtractionProjectScope(input.userId, input.projectId)
  if (!scope) {
    throw new Error("对标账号不存在或无权限")
  }

  const account = await db.watchAccount.findFirst({
    where: { id: input.watchAccountId, userId: input.userId, projectId: scope },
    select: { id: true },
  })
  if (!account) throw new Error("对标账号不存在或无权限")

  const existing = await db.videoCopyExtraction.findFirst({
    where: { userId: input.userId, projectId: scope, sourceUrl },
    orderBy: { createdAt: "desc" },
  })
  if (existing) return existing

  const createExtraction = input.createExtraction ?? createVideoCopyExtraction
  return createExtraction(input.userId, sourceUrl, scope)
}

/**
 * @description serializewatchvideoextraction
 * @param record - 记录
 * @returns 无返回值
 */
export function serializeWatchVideoExtraction(
  record: Awaited<ReturnType<typeof createWatchVideoExtraction>>,
) {
  return serializeVideoCopyExtraction(record)
}
