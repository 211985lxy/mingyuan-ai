import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import type { Prisma } from "@/generated/prisma/client"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { executeAimGenerationDomain } from "@/lib/aim-harness/domain-executor"
import { createAimTrace } from "@/lib/aim-observability"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonRecord(request)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle.trim() : undefined

    // 校验
    const inspiration = await prisma.inspiration.findFirst({
      where: { id, userId: user.id },
    })
    if (!inspiration) {
      return NextResponse.json({ error: "灵感记录不存在" }, { status: 404 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "请选择 IP 营销全案" }, { status: 400 })
    }

    const project = await prisma.clientProject.findFirst({
      where: { id: projectId, userId: user.id, status: "active" },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: "IP 营销全案不存在" }, { status: 404 })
    }

    const trace = await createAimTrace({
      userId: user.id,
      projectId,
      agentId: "content_producer",
      action: "generate",
      inputSummary: inspiration.content,
    })
    const targetFormats: Array<"video_script" | "shooting_brief" | "moments_post"> = [
      "video_script",
      "shooting_brief",
      "moments_post",
    ]
    const run = await executeAimRun({
      entrypoint: "inspiration",
      rawInput: inspiration.content,
      agentId: "content_producer",
      targetFormats,
      taskType: "write_script",
      topicTitle,
      actorId: user.id,
      projectId,
      trace,
      runLlmQuality: false,
    }, (spec) => executeAimGenerationDomain(spec, {
          userId: user.id,
          projectId,
          rawInput: inspiration.content,
          targetFormats,
          taskType: "write_script",
          topicTitle,
          trace,
        }))

    const result = run.output

    // 更新灵感记录，关联生成结果
    await prisma.inspiration.update({
      where: { id, userId: user.id },
      data: {
        generatedContent: result as unknown as Prisma.InputJsonValue,
        aimGenerationId: result.id,
      },
    })

    return NextResponse.json({
      ...result,
      runId: run.metadata.runId,
      degraded: run.metadata.degraded,
      provider: run.metadata.provider,
      model: run.metadata.model,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error("[inspiration/generate] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文案生成失败" },
      { status: 500 }
    )
  }
}
