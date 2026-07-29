import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { buildAimExportDocx, type OfficeExportSection } from "@/lib/aim/export-office-docx"
import { AIM_FORMAT_LABELS } from "@/lib/aim/workbench-display"
import type { ContentFormat } from "@/lib/aim-generator"
import { getCanonicalFromTaskSpec } from "@/lib/canonical-content-spec"

export const dynamic = "force-dynamic"

const FORMAT_COLUMNS: Array<{ format: ContentFormat; column: keyof {
  videoScript: string | null
  wechatArticle: string | null
  momentsPost: string | null
  communityMessage: string | null
  shootingBrief: string | null
  rawCopy: string | null
} }> = [
  { format: "video_script", column: "videoScript" },
  { format: "wechat_article", column: "wechatArticle" },
  { format: "moments_post", column: "momentsPost" },
  { format: "community_message", column: "communityMessage" },
  { format: "shooting_brief", column: "shootingBrief" },
  { format: "raw_copy", column: "rawCopy" },
]

/**
 * POST /api/aim/export-office
 * 用户侧导出 Word：优先 OfficeCLI，失败回退 JSZip 最小 docx。
 *
 * body:
 * - generationId?: string  已保存记录
 * - format?: ContentFormat | "all"
 * - title?: string
 * - sections?: { heading, content }[]  可覆盖（含未落库的最新编辑）
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)

    const sectionsFromBody = Array.isArray(body.sections)
      ? body.sections
          .filter((item): item is { heading?: unknown; content?: unknown } => Boolean(item) && typeof item === "object")
          .map((item) => ({
            heading: typeof item.heading === "string" ? item.heading : "",
            content: typeof item.content === "string" ? item.content : "",
          }))
          .filter((item) => item.content.trim() || item.heading.trim())
      : null

    let title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : "AIM 交付物"
    const sections: OfficeExportSection[] = sectionsFromBody ?? []

    const generationId = typeof body.generationId === "string" ? body.generationId.trim() : ""
    if (sections.length === 0 && generationId) {
      const record = await prisma.aimGeneration.findFirst({
        where: { id: generationId, userId: user.id },
        select: {
          id: true,
          taskSpec: true,
          topicTitle: true,
          videoScript: true,
          wechatArticle: true,
          momentsPost: true,
          communityMessage: true,
          shootingBrief: true,
          rawCopy: true,
        },
      })
      if (!record) {
        return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
      }

      const canonical = getCanonicalFromTaskSpec(record.taskSpec)
      title =
        (typeof body.title === "string" && body.title.trim()) ||
        record.topicTitle?.trim() ||
        canonical?.coreMessage?.trim().slice(0, 40) ||
        `AIM-${record.id.slice(0, 8)}`

      const formatFilter =
        typeof body.format === "string" && body.format !== "all"
          ? (body.format as ContentFormat)
          : null

      for (const item of FORMAT_COLUMNS) {
        if (formatFilter && item.format !== formatFilter) continue
        const content = record[item.column]
        if (typeof content === "string" && content.trim()) {
          sections.push({
            heading: AIM_FORMAT_LABELS[item.format] || item.format,
            content,
          })
        }
      }

      // 小红书等 artifacts
      const artifacts =
        record.taskSpec &&
        typeof record.taskSpec === "object" &&
        !Array.isArray(record.taskSpec) &&
        (record.taskSpec as { contentPackage?: { artifacts?: Record<string, string> } }).contentPackage
          ?.artifacts
      if (artifacts && typeof artifacts === "object") {
        for (const [format, content] of Object.entries(artifacts)) {
          if (formatFilter && format !== formatFilter) continue
          if (typeof content === "string" && content.trim()) {
            sections.push({
              heading: AIM_FORMAT_LABELS[format as ContentFormat] || format,
              content,
            })
          }
        }
      }
    }

    if (sections.length === 0) {
      return NextResponse.json({ error: "没有可导出的正文，请先生成或传入 sections" }, { status: 400 })
    }

    const exported = await buildAimExportDocx({ title, sections })
    const asciiName = exported.fileName.replace(/[^\x20-\x7E]/g, "_")
    const encodedName = encodeURIComponent(exported.fileName)

    return new NextResponse(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        "X-Export-Engine": exported.engine,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid token")) {
      return authErrorResponse(error)
    }
    console.error("[aim/export-office]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导出 Word 失败" },
      { status: 500 },
    )
  }
}
