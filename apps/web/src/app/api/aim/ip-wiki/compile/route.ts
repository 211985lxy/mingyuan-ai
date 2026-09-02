import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { compilePositioningToWiki, type ExistingWikiPageRef } from "@/lib/ip-wiki/compile"
import { splitGenerationReasoning } from "@/lib/aim-generation-text"

export const maxDuration = 60

/**
 * Ingest：把一份定位方案（定位策划官产出）编译成结构化 IP 维基页（提议，待人工确认）。
 * 可传 sourceGenerationId（推荐，从 AimGeneration.rawCopy 取定位方案），
 * 或直接传 positioningText。
 */
/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const sourceGenerationId =
      typeof body.sourceGenerationId === "string" ? body.sourceGenerationId.trim() : ""
    const positioningText =
      typeof body.positioningText === "string" ? body.positioningText.trim() : ""

    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }

    const project = await prisma.clientProject.findFirst({
      where: { id: projectId, userId: user.id, status: "active" },
      select: { id: true, name: true },
    })
    if (!project) {
      return NextResponse.json({ error: "IP营销全案不存在或已归档" }, { status: 404 })
    }

    let effectiveText = positioningText
    let effectiveGenerationId = sourceGenerationId

    if (sourceGenerationId) {
      const generation = await prisma.aimGeneration.findFirst({
        where: { id: sourceGenerationId, userId: user.id, projectId },
        select: { id: true, agentId: true, rawCopy: true },
      })
      if (!generation) {
        return NextResponse.json({ error: "定位方案记录不存在" }, { status: 404 })
      }
      effectiveGenerationId = generation.id
      // 优先用调用方传入的实时文本（可能是用户在交付气泡里编辑过的版本），
      // 没传再回退数据库原文；sourceGenerationId 始终用于来源溯源。
      if (!effectiveText) {
        // 剥离 METHOD_NOTE，避免把思考依据编进 wiki 污染后续检索素材
        effectiveText = splitGenerationReasoning(generation.rawCopy ?? "").content.trim()
      }
    }

    if (!effectiveText) {
      return NextResponse.json(
        { error: "没有可编译的定位方案文本" },
        { status: 400 }
      )
    }

    const existingRows = await prisma.ipWikiPage.findMany({
      where: { projectId, status: "active" },
      select: { pageType: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    })
    const existingPages: ExistingWikiPageRef[] = existingRows.map((row) => ({
      pageType: row.pageType as ExistingWikiPageRef["pageType"],
      title: row.title,
    }))

    const pages = await compilePositioningToWiki({
      positioningText: effectiveText,
      projectName: project.name,
      existingPages,
      sourceGenerationId: effectiveGenerationId,
    })

    return NextResponse.json({ pages, sourceGenerationId: effectiveGenerationId ?? null })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/ip-wiki/compile] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "维基编译失败" },
      { status: 500 }
    )
  }
}
