import { NextRequest, NextResponse } from "next/server"

import { validateCronSecret } from "@/lib/admin-auth"
import { isPublishReminderEnabled, listPublishReminderDue } from "@/lib/aim/publish-reminder"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * 发布半自动提醒：找出缺作品 ID 的已发布内容。默认关。
 * 真正推飞书卡片要等 AIM_PUBLISH_REMINDER_ENABLED=true 且运维批准后另接发送通道。
 */
export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isPublishReminderEnabled()) {
    return NextResponse.json({ ok: true, enabled: false, due: 0 })
  }
  try {
    const due = await listPublishReminderDue({
      store: {
        aimGeneration: {
          findMany: async (args) =>
            prisma.aimGeneration.findMany({
              where: args?.where as never,
              select: {
                id: true,
                userId: true,
                projectId: true,
                topicTitle: true,
                publishPlatform: true,
                publishUrl: true,
                publishedAt: true,
              },
              take: args?.take ?? 200,
            }),
        },
      },
    })
    return NextResponse.json({ ok: true, enabled: true, due: due.length, ids: due.map((row) => row.id) })
  } catch (error) {
    console.error("[cron/publish-reminder] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "发布提醒执行失败" }, { status: 503 })
  }
}
