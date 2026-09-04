import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import {
  buildAimHistoryUpdateData,
  parseAimHistoryUpdate,
} from "@/lib/aim/services/history-update"
import { buildOutcomeUpdate, sanitizeOutcomeBody, type SanitizedOutcome } from "@/lib/content-outcome"
import { normalizeAimGenerationForRead } from "@/lib/aim/history-normalize"

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const record = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
    })
    if (!record) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }
    return NextResponse.json(normalizeAimGenerationForRead({
      ...record,
      agentId:
        record.agentId === "ip_video"
          ? "content_producer"
          : record.agentId === "deep_copywriter"
            ? "work_editor"
            : record.agentId,
    }))
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "生成记录读取失败" },
      { status: 500 }
    )
  }
}

/**
 * @description 处理 PATCH 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonRecord(request)

    const existing = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        retroSnapshots: true,
        calibrationRules: true,
        decisionSnapshot: true,
        projectId: true,
        topicSelectionId: true,
        workflowStatus: true,
        publishPlatform: true,
        publishUrl: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    const input = parseAimHistoryUpdate(body, new Date().toISOString(), {
      fromStatus: existing.workflowStatus,
      existingPublishPlatform: existing.publishPlatform,
      existingPublishUrl: existing.publishUrl,
    })
    if (!input.ok) {
      return NextResponse.json({ error: input.error }, { status: 400 })
    }

    let projectId: string | undefined
    if (typeof body.projectId === "string" && body.projectId.trim()) {
      const ownedProject = await prisma.clientProject.findFirst({
        where: { id: body.projectId.trim(), userId: user.id, status: "active" },
        select: { id: true },
      })
      if (!ownedProject) return NextResponse.json({ error: "客户全案不存在或不可用" }, { status: 404 })
      if (existing.projectId && existing.projectId !== ownedProject.id) {
        return NextResponse.json({ error: "已归属客户全案的内容不能直接转移" }, { status: 409 })
      }
      projectId = ownedProject.id
    }

    let retroOutcome: { sanitized: SanitizedOutcome; presentKeys: Set<string> } | undefined
    if (body.retroOutcome !== undefined) {
      if (!body.retroOutcome || typeof body.retroOutcome !== "object" || Array.isArray(body.retroOutcome)) {
        return NextResponse.json({ error: "复盘结果格式不正确" }, { status: 400 })
      }
      try {
        const rawOutcome = body.retroOutcome as Record<string, unknown>
        retroOutcome = { sanitized: sanitizeOutcomeBody(rawOutcome), presentKeys: new Set(Object.keys(rawOutcome)) }
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "复盘结果格式不正确" }, { status: 400 })
      }
    }

    const record = await prisma.$transaction(async (tx) => {
      const updated = await tx.aimGeneration.update({
        where: { id },
        data: {
          ...buildAimHistoryUpdateData(input.data, existing),
          projectId,
        },
      })
      if (projectId) {
        await tx.contentOutcome.updateMany({
          where: { userId: user.id, generationId: id },
          data: { projectId },
        })
      }
      if (retroOutcome) {
        const effectiveProjectId = projectId || existing.projectId
        await tx.contentOutcome.upsert({
          where: {
            userId_generationId_collectWindowDay: {
              userId: user.id,
              generationId: id,
              collectWindowDay: retroOutcome.sanitized.collectWindowDay,
            },
          },
          create: {
            userId: user.id,
            generationId: id,
            topicSelectionId: existing.topicSelectionId,
            projectId: effectiveProjectId,
            ...retroOutcome.sanitized,
          },
          update: {
            ...buildOutcomeUpdate(retroOutcome.sanitized, retroOutcome.presentKeys),
            projectId: effectiveProjectId,
          },
        })
      }
      return updated
    })

    return NextResponse.json(record)
  } catch (error) {
    return authErrorResponse(error) ?? apiRequestErrorResponse(request, error) ?? NextResponse.json(
      { error: "生成记录更新失败" },
      { status: 500 }
    )
  }
}

/**
 * @description 处理 DELETE 请求
 * @param _request - _request
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(_request)
    const { id } = await params

    const existing = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    await prisma.aimGeneration.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "生成记录删除失败" },
      { status: 500 }
    )
  }
}
