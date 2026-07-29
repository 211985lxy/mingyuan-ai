import { NextRequest, NextResponse } from "next/server"

import { recordAdminAudit } from "@/lib/admin-audit"
import { withAdminAuth } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { isPrismaUniqueConstraintError } from "@/lib/aim/aim-run-event-write"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export const GET = withAdminAuth(async (request: NextRequest) => {
  const workflowId = request.nextUrl.searchParams.get("workflowId")?.trim()
  const taskType = request.nextUrl.searchParams.get("taskType")?.trim()
  const items = await prisma.taskEfficiencyBaseline.findMany({
    where: {
      ...(workflowId ? { workflowId } : {}),
      ...(taskType ? { taskType } : {}),
    },
    orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    take: 500,
  })
  return NextResponse.json({ items })
}, "admin")

export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  const body = await parseJsonRecord(request, { maxBytes: 8 * 1024 })
  const workflowId = typeof body.workflowId === "string" ? body.workflowId.trim() : ""
  const taskType = typeof body.taskType === "string" ? body.taskType.trim() : ""
  const medianManualMinutes = Number(body.medianManualMinutes)
  const sampleSize = Number(body.sampleSize)
  const validFrom = typeof body.validFrom === "string" ? new Date(body.validFrom) : new Date()
  if (!workflowId || workflowId.length > 80 || !taskType || taskType.length > 80) {
    return NextResponse.json({ error: "workflowId/taskType 不合法" }, { status: 400 })
  }
  if (!Number.isFinite(medianManualMinutes) || medianManualMinutes <= 0) {
    return NextResponse.json({ error: "medianManualMinutes 必须大于 0" }, { status: 400 })
  }
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    return NextResponse.json({ error: "sampleSize 必须是正整数" }, { status: 400 })
  }
  if (Number.isNaN(validFrom.getTime())) {
    return NextResponse.json({ error: "validFrom 不合法" }, { status: 400 })
  }

  try {
    const created = await prisma.taskEfficiencyBaseline.create({
      data: {
        workflowId,
        taskType,
        medianManualMinutes,
        sampleSize,
        validFrom,
        approvedBy: admin.id,
      },
    })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "task_efficiency_baseline.create",
      targetType: "task_efficiency_baseline",
      targetId: created.id,
      metadata: { workflowId, taskType, medianManualMinutes, sampleSize, validFrom: validFrom.toISOString() },
    })
    return NextResponse.json(
      { item: created },
      { status: 201, headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return NextResponse.json({ error: "同一生效时间的基线版本已存在" }, { status: 409 })
    }
    throw error
  }
}, "admin")
