import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { AIM_AGENT_IDS } from "@/lib/aim-harness/contracts"

const VALID_AGENT_IDS = Array.from(AIM_AGENT_IDS)

const createSchema = z.object({
  platform: z.enum(["feishu", "workbuddy_wechat", "wecom"]),
  externalChatId: z.string().trim().min(1).max(191),
  externalAccountId: z.string().trim().max(191).optional(),
  projectId: z.string().trim().min(1).max(80),
  triggerMode: z.enum(["mention_or_keyword", "all"]).default("mention_or_keyword"),
  triggerKeywords: z.array(z.string().trim().min(1).max(40)).max(10).default(["收选题"]),
  executionMode: z.enum(["capture_only", "evaluate", "live"]).default("live"),
  /** 路由目标：topic（选题采集，默认）| aim（AIM 智能体对话） */
  routeTarget: z.enum(["topic", "aim"]).default("topic"),
  /** routeTarget=aim 时的默认智能体；为空则要求消息带 /命令 */
  defaultAgentId: z.enum(VALID_AGENT_IDS as [string, ...string[]]).optional().nullable(),
}).strict()

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const bindings = await prisma.channelBinding.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { project: { select: { id: true, name: true, status: true } } },
    })

    // Aggregate health metrics per binding
    const bindingIds = bindings.map((b) => b.id)
    const recentInspirations = bindingIds.length > 0
      ? await prisma.inspiration.groupBy({
          by: ["source"],
          where: {
            userId: user.id,
            source: { in: bindings.map((b) => b.platform) },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          _max: { createdAt: true },
          _count: { id: true },
        })
      : []

    const recentOutboxStats = bindingIds.length > 0
      ? await prisma.channelReplyOutbox.groupBy({
          by: ["platform", "status"],
          where: {
            inspiration: { userId: user.id },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          _count: { id: true },
        })
      : []

    // Build lookup maps
    const inspirationsByPlatform = new Map(recentInspirations.map((r) => [r.source, r]))
    const outboxByPlatformStatus = new Map(recentOutboxStats.map((r) => [`${r.platform}:${r.status}`, r._count.id]))

    const items = bindings.map((binding) => {
      const recentInsp = inspirationsByPlatform.get(binding.platform)
      const deadLetterCount = outboxByPlatformStatus.get(`${binding.platform}:dead_letter`) ?? 0
      const sentCount = outboxByPlatformStatus.get(`${binding.platform}:sent`) ?? 0
      const healthStatus = deadLetterCount > 0 ? "degraded" : sentCount > 0 ? "healthy" : "unknown"

      return {
        ...binding,
        lastReceivedAt: recentInsp?._max.createdAt?.toISOString() ?? null,
        receivedCount24h: recentInsp?._count.id ?? 0,
        sentCount24h: sentCount,
        deadLetterCount24h: deadLetterCount,
        healthStatus,
      }
    })

    return NextResponse.json({ items })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "群聊绑定读取失败" }, { status: 500 })
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
    const body = await parseJsonBody(request, createSchema, { maxBytes: 8 * 1024 })
    const project = await prisma.clientProject.findFirst({ where: { id: body.projectId, userId: user.id, status: "active" }, select: { id: true } })
    if (!project) return NextResponse.json({ error: "项目不存在或不可用" }, { status: 403 })
    const existing = await prisma.channelBinding.findUnique({
      where: { platform_externalAccountId_externalChatId: { platform: body.platform, externalAccountId: body.externalAccountId || "", externalChatId: body.externalChatId } },
      select: { userId: true },
    })
    if (existing && existing.userId !== user.id) return NextResponse.json({ error: "该群已绑定到其他 AIM 账号" }, { status: 409 })
    const binding = await prisma.channelBinding.upsert({
      where: { platform_externalAccountId_externalChatId: { platform: body.platform, externalAccountId: body.externalAccountId || "", externalChatId: body.externalChatId } },
      create: { ...body, userId: user.id, status: "active" },
      update: {
        projectId: body.projectId,
        triggerMode: body.triggerMode,
        triggerKeywords: body.triggerKeywords,
        executionMode: body.executionMode,
        routeTarget: body.routeTarget,
        defaultAgentId: body.defaultAgentId,
        status: "active",
      },
      include: { project: { select: { id: true, name: true, status: true } } },
    })
    return NextResponse.json(binding, { status: existing ? 200 : 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "群聊绑定保存失败" }, { status: 500 })
  }
}
