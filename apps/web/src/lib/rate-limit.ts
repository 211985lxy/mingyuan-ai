import { prisma } from "./prisma"
import { PLAN_CONCURRENCY_LIMITS } from "@/types/content-template"
import { ACTIVE_VIDEO_TASK_STATUSES } from "@/lib/video-task-domain"

type VideoTaskCountClient = Pick<typeof prisma, "videoTask">

/**
 * Check if user has exceeded their concurrent video generation limit.
 * Returns the count of currently processing tasks.
 */
export async function checkConcurrencyLimit(
  userId: string,
  plan: string,
  db: VideoTaskCountClient = prisma,
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = PLAN_CONCURRENCY_LIMITS[plan] ?? 1
  const current = await db.videoTask.count({
    where: { userId, status: { in: [...ACTIVE_VIDEO_TASK_STATUSES] } },
  })
  return { allowed: current < limit, current, limit }
}
