import { NextResponse } from "next/server"

import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import {
  extractStructuresFromBatch,
  isBatchTooLargeError,
  splitScripts,
} from "@/lib/aim/script-structure-extractor"
import {
  listExtractedStructures,
  saveExtractedStructure,
} from "@/lib/aim/script-structure-store"

// ─── GET: 列出当前用户已提取的结构模板 ───────────────────

export const GET = withUserAuth(async (request, { user }) => {
  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId") || undefined
  const limitParam = url.searchParams.get("limit")
  const limit = limitParam ? Number(limitParam) : 50

  const records = await listExtractedStructures(user.id, projectId, limit)
  return NextResponse.json({ data: records })
})

// ─── POST: 批量提取文案结构 ───────────────────────────────

const MAX_BATCH_BYTES = 256 * 1024 // 256KB：支持粘贴多条文案或 .txt/.md 文件内容

export const POST = withUserAuth(async (request, { user }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request, { maxBytes: MAX_BATCH_BYTES })
  } catch (error) {
    const handled = apiRequestErrorResponse(request, error)
    if (handled) return handled
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 })
  }

  // 支持两种输入：scripts: string[] 或 text: string（自动切分）
  const scripts = parseScriptsInput(body)
  if (scripts.length === 0) {
    return NextResponse.json({ error: "请提供至少一条文案内容" }, { status: 400 })
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined

  try {
    const extraction = await extractStructuresFromBatch(scripts)
    const record = await saveExtractedStructure({
      structure: extraction.structure,
      sourceScripts: scripts,
      userId: user.id,
      projectId,
    })
    return NextResponse.json(
      {
        data: {
          structure: record,
          analyses: extraction.analyses,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    if (isBatchTooLargeError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : "结构提取失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

/** 从请求体解析文案数组：优先 scripts[]，其次 text（自动切分）。 */
function parseScriptsInput(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.scripts)) {
    return (body.scripts as unknown[])
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (typeof body.text === "string" && body.text.trim()) {
    return splitScripts(body.text)
  }
  return []
}
