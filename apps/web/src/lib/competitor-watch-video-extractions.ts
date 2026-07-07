import { prisma } from "@/lib/prisma"
import {
  createVideoCopyExtraction,
  serializeVideoCopyExtraction,
} from "@/lib/video-copy-extractions"
import { assertSupportedVideoUrl } from "@/lib/video-text-extractor"

type DbLike = Pick<typeof prisma, "watchAccount" | "videoCopyExtraction">

export async function createWatchVideoExtraction(input: {
  userId: string
  watchAccountId: string
  videoUrl: string
  db?: DbLike
  createExtraction?: typeof createVideoCopyExtraction
}) {
  const db = input.db ?? prisma
  const sourceUrl = assertSupportedVideoUrl(input.videoUrl)

  const account = await db.watchAccount.findFirst({
    where: { id: input.watchAccountId, userId: input.userId },
    select: { id: true },
  })
  if (!account) throw new Error("对标账号不存在或无权限")

  const existing = await db.videoCopyExtraction.findFirst({
    where: { userId: input.userId, sourceUrl },
    orderBy: { createdAt: "desc" },
  })
  if (existing) return existing

  const createExtraction = input.createExtraction ?? createVideoCopyExtraction
  return createExtraction(input.userId, sourceUrl)
}

export function serializeWatchVideoExtraction(
  record: Awaited<ReturnType<typeof createWatchVideoExtraction>>,
) {
  return serializeVideoCopyExtraction(record)
}
