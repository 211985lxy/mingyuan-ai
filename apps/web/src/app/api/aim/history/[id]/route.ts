import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

const VALID_WORKFLOW_STATUS = new Set([
  "draft",
  "pending_review",
  "ready_to_shoot",
  "shooting",
  "editing",
  "ready_to_publish",
  "published",
  "archived",
])

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readJsonArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecordObject) : []
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        retroSnapshots: true,
        calibrationRules: true,
        decisionSnapshot: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    const workflowStatus =
      typeof body.workflowStatus === "string" && VALID_WORKFLOW_STATUS.has(body.workflowStatus)
        ? body.workflowStatus
        : undefined
    const reviewNote =
      typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 2000) : undefined
    const publishPlatform =
      typeof body.publishPlatform === "string" ? body.publishPlatform.trim().slice(0, 50) : undefined
    const publishUrl =
      typeof body.publishUrl === "string" ? body.publishUrl.trim().slice(0, 2000) : undefined
    const decisionSnapshot = isRecordObject(body.decisionSnapshot)
      ? {
          summary: typeof body.decisionSnapshot.summary === "string"
            ? body.decisionSnapshot.summary.trim().slice(0, 2000)
            : "",
          targetUser: typeof body.decisionSnapshot.targetUser === "string"
            ? body.decisionSnapshot.targetUser.trim().slice(0, 500)
            : undefined,
          expectedSignal: typeof body.decisionSnapshot.expectedSignal === "string"
            ? body.decisionSnapshot.expectedSignal.trim().slice(0, 1000)
            : undefined,
          confidence: typeof body.decisionSnapshot.confidence === "string"
            ? body.decisionSnapshot.confidence.trim().slice(0, 100)
            : undefined,
          createdAt: new Date().toISOString(),
        }
      : undefined
    const retroSnapshot = isRecordObject(body.retroSnapshot)
      ? {
          summary: typeof body.retroSnapshot.summary === "string"
            ? body.retroSnapshot.summary.trim().slice(0, 2000)
            : "",
          actualData: typeof body.retroSnapshot.actualData === "string"
            ? body.retroSnapshot.actualData.trim().slice(0, 2000)
            : undefined,
          verdict: typeof body.retroSnapshot.verdict === "string"
            ? body.retroSnapshot.verdict.trim().slice(0, 500)
            : undefined,
          nextRule: typeof body.retroSnapshot.nextRule === "string"
            ? body.retroSnapshot.nextRule.trim().slice(0, 1000)
            : undefined,
          createdAt: new Date().toISOString(),
        }
      : undefined
    const calibrationRule = isRecordObject(body.calibrationRule)
      ? {
          rule: typeof body.calibrationRule.rule === "string"
            ? body.calibrationRule.rule.trim().slice(0, 1000)
            : "",
          source: typeof body.calibrationRule.source === "string"
            ? body.calibrationRule.source.trim().slice(0, 300)
            : undefined,
          createdAt: new Date().toISOString(),
        }
      : undefined

    if (decisionSnapshot && !decisionSnapshot.summary) {
      return NextResponse.json({ error: "发布前判断不能为空" }, { status: 400 })
    }
    if (retroSnapshot && !retroSnapshot.summary) {
      return NextResponse.json({ error: "复盘结论不能为空" }, { status: 400 })
    }
    if (calibrationRule && !calibrationRule.rule) {
      return NextResponse.json({ error: "下次判断规则不能为空" }, { status: 400 })
    }

    const record = await prisma.aimGeneration.update({
      where: { id, userId: user.id },
      data: {
        workflowStatus,
        reviewNote,
        publishedAt: workflowStatus === "published" ? new Date() : undefined,
        publishPlatform,
        publishUrl,
        decisionSnapshot: decisionSnapshot
          ? (isRecordObject(existing.decisionSnapshot) ? existing.decisionSnapshot : decisionSnapshot)
          : undefined,
        retroSnapshots: retroSnapshot
          ? ([...readJsonArray(existing.retroSnapshots), retroSnapshot] as Prisma.InputJsonValue)
          : undefined,
        calibrationRules: calibrationRule
          ? ([...readJsonArray(existing.calibrationRules), calibrationRule] as Prisma.InputJsonValue)
          : undefined,
      },
    })

    return NextResponse.json(record)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "生成记录更新失败" },
      { status: 500 }
    )
  }
}

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

    await prisma.aimGeneration.delete({ where: { id, userId: user.id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "生成记录删除失败" },
      { status: 500 }
    )
  }
}
