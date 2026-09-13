import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { apiRequestErrorResponse } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import {
  AccountProjectContextError,
  resolveBoundProject,
} from "@/lib/account-project-context"
import {
  EXPORT_PER_TYPE_LIMIT,
  DATA_SOVEREIGNTY_STATEMENT,
  buildProjectExportBundle,
  toMarkdownExport,
  type ProjectExportBundle,
} from "@/lib/aim/data-export"

export const dynamic = "force-dynamic"

/**
 * 数据主权 L0（WP-A6）：项目数据一键导出。
 *
 * 只导出账号绑定项目自己的数据；format=json|markdown 以附件下载返回。
 * 上限保护：每类 EXPORT_PER_TYPE_LIMIT 条，触顶在导出元信息里如实标记。
 */

async function loadProjectExport(projectId: string) {
  const [generations, knowledgeEntries, contentOutcomes] = await Promise.all([
    prisma.aimGeneration.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: EXPORT_PER_TYPE_LIMIT,
      select: {
        id: true,
        topicTitle: true,
        workflowStatus: true,
        publishPlatform: true,
        publishUrl: true,
        publishedAt: true,
        createdAt: true,
        rawInput: true,
        videoScript: true,
        wechatArticle: true,
        momentsPost: true,
        shootingBrief: true,
        rawCopy: true,
        qualityScores: true,
      },
    }),
    prisma.knowledgeEntry.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: EXPORT_PER_TYPE_LIMIT,
      select: {
        id: true,
        category: true,
        title: true,
        content: true,
        tags: true,
        valueGrade: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.contentOutcome.findMany({
      where: { projectId },
      orderBy: { collectedAt: "desc" },
      take: EXPORT_PER_TYPE_LIMIT,
      select: {
        id: true,
        generationId: true,
        collectWindowDay: true,
        views: true,
        likes: true,
        comments: true,
        saves: true,
        shares: true,
        qualifiedLeadCount: true,
        appointmentCount: true,
        dealCount: true,
        revenue: true,
        verdictCode: true,
        collectedAt: true,
      },
    }),
  ])
  return { generations, knowledgeEntries, contentOutcomes }
}

interface ExportRows {
  generations: Array<{
    id: string
    topicTitle: string | null
    workflowStatus: string
    publishPlatform: string | null
    publishUrl: string | null
    publishedAt: Date | null
    createdAt: Date
    rawInput: string
    videoScript: string | null
    wechatArticle: string | null
    momentsPost: string | null
    shootingBrief: string | null
    rawCopy: string | null
    qualityScores: unknown
  }>
  knowledgeEntries: Array<{
    id: string
    category: string
    title: string
    content: string
    tags: unknown
    valueGrade: string | null
    status: string
    createdAt: Date
  }>
  contentOutcomes: Array<{
    id: string
    generationId: string
    collectWindowDay: number
    views: number | null
    likes: number | null
    comments: number | null
    saves: number | null
    shares: number | null
    qualifiedLeadCount: number | null
    appointmentCount: number | null
    dealCount: number | null
    revenue: unknown
    verdictCode: string | null
    collectedAt: Date
  }>
}

function toBundle(project: { id: string; name: string }, rows: ExportRows, now: Date): ProjectExportBundle {
  return buildProjectExportBundle({
    exportedAt: now,
    project: { id: project.id, name: project.name },
    generations: rows.generations.map((row) => ({
      ...row,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    knowledgeEntries: rows.knowledgeEntries.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    contentOutcomes: rows.contentOutcomes.map((row) => ({
      ...row,
      revenue: row.revenue ? row.revenue.toString() : null,
      collectedAt: row.collectedAt.toISOString(),
    })),
  })
}

function exportResponse(bundle: ProjectExportBundle, format: string, stamp: string): NextResponse {
  if (format === "markdown" || format === "md") {
    return new NextResponse(toMarkdownExport(bundle), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="aim-export-${stamp}.md"`,
      },
    })
  }
  return new NextResponse(JSON.stringify({ ...bundle, sovereignty: DATA_SOVEREIGNTY_STATEMENT }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="aim-export-${stamp}.json"`,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const project = await resolveBoundProject({ userId: user.id })
    const format = (new URL(request.url).searchParams.get("format") ?? "json").toLowerCase()
    const now = new Date()
    const rows = await loadProjectExport(project.id)
    return exportResponse(toBundle(project, rows, now), format, now.toISOString().slice(0, 10))
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 })
    }
    return (
      authErrorResponse(error) ??
      apiRequestErrorResponse(request, error) ??
      NextResponse.json({ error: "导出失败" }, { status: 500 })
    )
  }
}
