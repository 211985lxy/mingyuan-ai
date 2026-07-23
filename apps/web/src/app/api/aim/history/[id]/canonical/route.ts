import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  buildCanonicalContentSpec,
  confirmCanonicalContentSpec,
  getCanonicalFromTaskSpec,
  parseCanonicalContentSpec,
  reviseCanonicalContentSpec,
  withCanonicalOnTaskSpec,
  type CanonicalContentSpec,
} from "@/lib/canonical-content-spec"
import type { TaskSpec } from "@/lib/task-spec"

/**
 * POST — 确认或修订母内容（写入 AimGeneration.taskSpec.canonical）
 * body: { action: "confirm" | "revise", canonical?: partial overrides }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonRecord(request)
    const action = body.action === "revise" ? "revise" : body.action === "confirm" ? "confirm" : null
    if (!action) {
      return NextResponse.json({ error: "action 须为 confirm 或 revise" }, { status: 400 })
    }

    const record = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        taskSpec: true,
        rawInput: true,
        knowledgeUsed: true,
      },
    })
    if (!record) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    const taskSpec = (record.taskSpec && typeof record.taskSpec === "object" && !Array.isArray(record.taskSpec)
      ? record.taskSpec
      : null) as TaskSpec | null

    if (!taskSpec) {
      return NextResponse.json({ error: "该记录缺少 taskSpec，无法确认母内容" }, { status: 409 })
    }

    const knowledgeUsed = Array.isArray(record.knowledgeUsed)
      ? (record.knowledgeUsed as Array<{ id?: string; title?: string; category?: string }>)
          .filter((item) => item && typeof item.id === "string" && typeof item.title === "string")
          .map((item) => ({
            id: item.id as string,
            title: item.title as string,
            category: typeof item.category === "string" ? item.category : "unknown",
          }))
      : []

    let current = getCanonicalFromTaskSpec(taskSpec)
    if (!current) {
      current = buildCanonicalContentSpec({
        taskSpec,
        currentInput: record.rawInput,
        knowledgeUsed,
      })
    }

    const patch = body.canonical && typeof body.canonical === "object" && !Array.isArray(body.canonical)
      ? parseCanonicalContentSpec({
          ...current,
          ...(body.canonical as Record<string, unknown>),
          schemaVersion: 1,
          coreMessage:
            typeof (body.canonical as { coreMessage?: unknown }).coreMessage === "string"
              ? (body.canonical as { coreMessage: string }).coreMessage
              : current.coreMessage,
        })
      : null

    const nextDraft: CanonicalContentSpec = patch
      ? {
          ...current,
          ...patch,
          schemaVersion: 1,
          versionHistory: current.versionHistory,
          knowledgeUsed: patch.knowledgeUsed.length > 0 ? patch.knowledgeUsed : current.knowledgeUsed,
        }
      : current

    const next =
      action === "confirm"
        ? confirmCanonicalContentSpec(nextDraft)
        : reviseCanonicalContentSpec(current, nextDraft)

    const nextTaskSpec = withCanonicalOnTaskSpec(taskSpec, next)
    const updated = await prisma.aimGeneration.update({
      where: { id: record.id },
      data: { taskSpec: nextTaskSpec as unknown as Prisma.InputJsonValue },
      select: { id: true, taskSpec: true },
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        canonical: next,
        taskSpec: updated.taskSpec,
      },
    })
  } catch (error) {
    return (
      authErrorResponse(error) ??
      NextResponse.json({ error: "母内容确认失败" }, { status: 500 })
    )
  }
}
