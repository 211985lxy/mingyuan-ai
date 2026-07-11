import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { generateAimContent } from "@/lib/aim-generator"
import type { ContentFormat } from "@/lib/aim-generator"
import type { Prisma } from "@/generated/prisma/client"
import { executeAimRun } from "@/lib/aim-harness/runtime"
import { createAimTrace } from "@/lib/aim-observability"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await request.json()
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

    const trace = await createAimTrace({
      userId: user.id,
      projectId,
      agentId: "content_producer",
      action: "generate",
      inputSummary: inspiration.content,
    })
    const targetFormats = ["video_script", "shooting_brief", "moments_post"] as ContentFormat[]
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
    }, async (spec) => {
      const output = await generateAimContent({
          userId: user.id,
          projectId,
          agentId: spec.agentId,
          rawInput: inspiration.content,
          targetFormats,
          taskType: "write_script",
          topicTitle,
          trace,
          runtimeTask: spec.runtimeTask,
        })
      return { output, generationId: output.id }
    })

    const result = run.output

    // 更新灵感记录，关联生成结果
    await prisma.inspiration.update({
      where: { id },
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
