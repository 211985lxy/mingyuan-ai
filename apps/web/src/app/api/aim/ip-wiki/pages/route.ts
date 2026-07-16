import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { listIpWikiPages, saveIpWikiPageBatch, type SaveIpWikiPageInput } from "@/lib/ip-wiki/repo"
import { isIpWikiPageType } from "@/lib/ip-wiki/types"

export const maxDuration = 30

async function ensureProject(userId: string, projectId: string) {
  return prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  })
}

/** GET /api/aim/ip-wiki/pages?projectId=... —— 列出某 IP 全案的 active 维基页 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    const project = await ensureProject(user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: "IP营销全案不存在或已归档" }, { status: 404 })
    }

    const pages = await listIpWikiPages({ projectId })
    return NextResponse.json({ pages })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/ip-wiki/pages GET] Error:", error)
    return NextResponse.json({ error: "维基页查询失败" }, { status: 500 })
  }
}

/** POST /api/aim/ip-wiki/pages —— 人工确认后写入维基页（同类型旧页归档、版本递增） */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    const sourceGenerationId =
      typeof body.sourceGenerationId === "string" ? body.sourceGenerationId.trim() : undefined
    const rawPages = Array.isArray(body.pages) ? body.pages : []

    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    if (rawPages.length === 0) {
      return NextResponse.json({ error: "pages 不能为空" }, { status: 400 })
    }

    const project = await ensureProject(user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: "IP营销全案不存在或已归档" }, { status: 404 })
    }

    const pages: SaveIpWikiPageInput[] = []
    for (const item of rawPages) {
      if (!item || typeof item !== "object") continue
      const pageType = typeof item.pageType === "string" ? item.pageType.trim() : ""
      const title = typeof item.title === "string" ? item.title.trim() : ""
      const content = typeof item.content === "string" ? item.content.trim() : ""
      if (!isIpWikiPageType(pageType) || !title || !content) continue
      pages.push({
        pageType,
        title: title.slice(0, 120),
        content: content.slice(0, 8000),
        frontmatter:
          item.frontmatter && typeof item.frontmatter === "object"
            ? (item.frontmatter as Record<string, unknown>)
            : {},
        sources: Array.isArray(item.sources) ? item.sources : [],
        links: Array.isArray(item.links) ? item.links : [],
      })
    }

    if (pages.length === 0) {
      return NextResponse.json({ error: "没有可保存的有效维基页" }, { status: 400 })
    }

    const saved = await saveIpWikiPageBatch({
      userId: user.id,
      projectId,
      sourceGenerationId,
      pages,
    })

    return NextResponse.json({ pages: saved }, { status: 201 })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/ip-wiki/pages POST] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "维基页保存失败" },
      { status: 500 }
    )
  }
}
