import { NextRequest, NextResponse } from "next/server"

import { parseDocument } from "@/lib/document-parser"
import { enforceUploadSizeLimit } from "@/lib/internal-beta-limits"
import { importOutcomeFromText } from "@/lib/aim/outcome-import-service"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export const dynamic = "force-dynamic"

const MAX_TEXT_LENGTH = 200_000

/**
 * @description 复盘表格导入：平台导出的 xlsx/csv 文件 → 文本化 → 复用粘贴解析管线 → upsert ContentOutcome
 * @param request - multipart 请求（file + generationId）
 * @returns 解析 summary 与 upsert 结果；解析失败不写库
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)

    const formData = await request.formData()
    const generationId = formData.get("generationId")
    if (typeof generationId !== "string" || !generationId.trim()) {
      return NextResponse.json({ error: "generationId 必填：请先选中要复盘的那条成稿" }, { status: 400 })
    }

    const files = formData.getAll("file").filter((item): item is File => item instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: "请上传一个平台导出的表格文件（xlsx/csv）" }, { status: 400 })
    }
    if (files.length > 1) {
      return NextResponse.json({ error: "单次只支持导入一个文件" }, { status: 400 })
    }
    const uploadLimitResponse = enforceUploadSizeLimit(files)
    if (uploadLimitResponse) return uploadLimitResponse

    const file = files[0]
    let text: string
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const chunks = await parseDocument(buffer, file.name)
      text = chunks.join("\n\n").trim().slice(0, MAX_TEXT_LENGTH)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : `${file.name} 解析失败` },
        { status: 400 },
      )
    }

    const result = await importOutcomeFromText({
      db: prisma,
      userId: user.id,
      generationId: generationId.trim(),
      text,
    })

    if (result.status === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    if (result.status === "parse_failed") {
      return NextResponse.json(
        { error: result.message, detail: { rawSnippet: result.rawSnippet, missingHints: result.missingHints } },
        { status: 422 },
      )
    }
    return NextResponse.json({
      outcome: result.outcome,
      summary: result.summary,
      confidence: result.confidence,
      missingHints: result.missingHints,
    })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
