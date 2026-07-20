import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

const reprocessSchema = z.object({
  action: z.enum(["reprocess", "resend"]),
  inspirationIds: z.array(z.string().trim().min(1)).min(1).max(50),
}).strict()

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10))
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)))
    const skip = (page - 1) * limit

    const where = {
      userId: user.id,
      OR: [
        { aiStatus: "failed" },
        { processingStage: "failed" },
      ],
    }

    const [items, total] = await Promise.all([
      prisma.inspiration.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          source: true,
          content: true,
          aiStatus: true,
          processingStage: true,
          errorMessage: true,
          executionModeSnapshot: true,
          replyStatus: true,
          replyErrorMessage: true,
          externalChatId: true,
          externalMessageId: true,
          createdAt: true,
          updatedAt: true,
          outboxReplies: {
            where: { status: "dead_letter" },
            select: { id: true, replyType: true, lastError: true, attempts: true, createdAt: true },
          },
        },
      }),
      prisma.inspiration.count({ where }),
    ])

    return NextResponse.json({ items, total, page, limit })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "失败任务读取失败" }, { status: 500 })
  }
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, reprocessSchema, { maxBytes: 8 * 1024 })

    // Verify ownership
    const inspirations = await prisma.inspiration.findMany({
      where: { id: { in: body.inspirationIds }, userId: user.id },
      select: { id: true, aiStatus: true, processingStage: true, source: true },
    })

    if (inspirations.length === 0) {
      return NextResponse.json({ error: "未找到指定的灵感记录" }, { status: 404 })
    }

    const ownedIds = new Set(inspirations.map((i) => i.id))
    const results: Array<{ id: string; action: string; status: "queued" | "skipped"; reason?: string }> = []

    for (const id of body.inspirationIds) {
      if (!ownedIds.has(id)) {
        results.push({ id, action: body.action, status: "skipped", reason: "无权访问" })
        continue
      }

      const inspiration = inspirations.find((i) => i.id === id)!

      if (body.action === "reprocess") {
        // Reset processing state and re-enqueue pipeline
        await prisma.inspiration.update({
          where: { id },
          data: {
            aiStatus: "pending",
            processingStage: "queued",
            errorMessage: null,
            replyStatus: "pending",
            replyErrorMessage: null,
          },
        })
        const { enqueueBackgroundTask } = await import("@/lib/background-tasks")
        await enqueueBackgroundTask(prisma, {
          kind: "inspiration_pipeline",
          aggregateType: "Inspiration",
          aggregateId: id,
          idempotencyKey: `reprocess:${id}:${Date.now()}`,
          maxAttempts: 3,
        })
        results.push({ id, action: "reprocess", status: "queued" })
      } else if (body.action === "resend") {
        // Re-enqueue dead-letter outbox replies
        const deadLetters = await prisma.channelReplyOutbox.findMany({
          where: { inspirationId: id, status: "dead_letter" },
        })
        if (deadLetters.length === 0) {
          results.push({ id, action: "resend", status: "skipped", reason: "无死信回复" })
          continue
        }
        for (const dl of deadLetters) {
          await prisma.channelReplyOutbox.update({
            where: { id: dl.id },
            data: { status: "pending", attempts: 0, lastError: null, claimToken: null, claimExpiresAt: null },
          })
          const { enqueueBackgroundTask } = await import("@/lib/background-tasks")
          await enqueueBackgroundTask(prisma, {
            kind: "inspiration_outbox_send",
            aggregateType: "ChannelReplyOutbox",
            aggregateId: dl.id,
            idempotencyKey: `resend:${dl.id}:${Date.now()}`,
            maxAttempts: 5,
          })
        }
        results.push({ id, action: "resend", status: "queued" })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "重新处理失败" }, { status: 500 })
  }
}
