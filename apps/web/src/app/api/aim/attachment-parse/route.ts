import { NextRequest, NextResponse } from "next/server"

import { parseDocument, isSupportedFile, DocumentParseError } from "@/lib/document-parser"
import { extractSniffedText, AttachmentTextError } from "@/lib/aim/attachment-text"
import { enforceUploadSizeLimit } from "@/lib/internal-beta-limits"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export const dynamic = "force-dynamic"

const MAX_TEXT_LENGTH = 200_000

/**
 * @description 聊天文件附件解析：pdf/docx/xlsx 等走 parseDocument，
 *  未知扩展名（.tst/.log 等）按纯文本探测；只返回文本，不落库不占 OSS。
 */
export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request)

    const formData = await request.formData()
    const files = formData.getAll("file").filter((item): item is File => item instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: "请上传一个文件" }, { status: 400 })
    }
    if (files.length > 1) {
      return NextResponse.json({ error: "单次只支持解析一个文件" }, { status: 400 })
    }
    const uploadLimitResponse = enforceUploadSizeLimit(files)
    if (uploadLimitResponse) return uploadLimitResponse

    const file = files[0]
    const buffer = Buffer.from(await file.arrayBuffer())
    let text: string
    try {
      if (isSupportedFile(file.name)) {
        const chunks = await parseDocument(buffer, file.name)
        text = chunks.join("\n\n")
      } else {
        text = extractSniffedText(buffer, file.name)
      }
    } catch (error) {
      if (error instanceof DocumentParseError) {
        return NextResponse.json({ error: error.message }, { status: error.status ?? 400 })
      }
      if (error instanceof AttachmentTextError) {
        return NextResponse.json({ error: error.message }, { status: error.status })
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : `${file.name} 解析失败` },
        { status: 400 },
      )
    }

    const trimmed = text.trim()
    if (!trimmed) {
      return NextResponse.json({ error: `${file.name} 没有解析出文本内容` }, { status: 422 })
    }
    return NextResponse.json({
      name: file.name,
      size: file.size,
      text: trimmed.slice(0, MAX_TEXT_LENGTH),
      truncated: trimmed.length > MAX_TEXT_LENGTH,
    })
  } catch (error) {
    const authResp = authErrorResponse(error)
    if (authResp) return authResp
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
