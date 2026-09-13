import { NextRequest, NextResponse } from "next/server"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"
import {
  buildProjectDataExport,
  exportFileName,
  renderProjectDataExportMarkdown,
} from "@/lib/aim/project-data-export"
import { loadProjectExportSource } from "@/lib/aim/project-data-export-store"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * api-inventory: domain=account kind=crud orchestratable=false auth=user_session input=query
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const format = new URL(request.url).searchParams.get("format") === "md" ? "md" : "json"
    const project = await resolveBoundProject({ userId: user.id })
    const exportedAt = new Date()
    const payload = buildProjectDataExport(
      await loadProjectExportSource({ userId: user.id, project }),
      exportedAt,
    )
    const fileName = exportFileName(project.name, format, exportedAt)

    if (format === "md") {
      return new NextResponse(renderProjectDataExportMarkdown(payload), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${fileName}"`,
        },
      })
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("[data-export]", error instanceof Error ? error.message : error)
    return authErrorResponse(error) ?? NextResponse.json({ error: "数据导出失败" }, { status: 500 })
  }
}
