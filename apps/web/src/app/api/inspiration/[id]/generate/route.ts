import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { generateAimContent } from "@/lib/aim-generator"
import type { ContentFormat } from "@/lib/aim-generator"
import type { Prisma } from "@/generated/prisma/client"
import { runAimGenerate } from "@/lib/aim-harness/adapters"
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

    // aim-harness-v1: route through the thin harness for runId/provider/model/
    // degraded + snapshot + trace. Inspiration is a content draft path.
    const trace = await createAimTrace({
      userId: user.id,
      projectId,
      agentId: "content_producer",
      action: "generate",
      inputSummary: inspiration.content,
    })
    const harness = await runAimGenerate({
      execute: () =>
        generateAimContent({
          userId: user.id,
          projectId,
          rawInput: inspiration.content,
          targetFormats: ["video_script", "shooting_brief", "moments_post"] as ContentFormat[],
          taskType: "write_script",
          topicTitle,
          trace,
        }),
      rawInput: inspiration.content,
      agentId: "content_producer",
      targetFormats: ["video_script", "shooting_brief", "moments_post"] as ContentFormat[],
      taskType: "write_script",
      entrypoint: "inspiration",
      trace,
      userId: user.id,
      projectId,
      runLlmQuality: false,
    })

    const result = harness.result

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
      runId: harness.runId,
      degraded: harness.degraded,
      provider: harness.provider,
      model: harness.model,
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
