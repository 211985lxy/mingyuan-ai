import { NextResponse } from "next/server"

import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import {
  extractStructuresFromBatch,
  isBatchTooLargeError,
  splitScripts,
} from "@/lib/aim/script-structure-extractor"
import { generateScriptsFromStructure } from "@/lib/aim/script-structure-generator"
import {
  blueprintToStructure,
  saveExtractedStructure,
  saveGeneratedScripts,
} from "@/lib/aim/script-structure-store"

// ─── POST: 一键串联（提取结构 → 生成文案） ─────────────────

const MAX_BATCH_BYTES = 256 * 1024

export const POST = withUserAuth(async (request, { user }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request, { maxBytes: MAX_BATCH_BYTES })
  } catch (error) {
    const handled = apiRequestErrorResponse(request, error)
    if (handled) return handled
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 })
  }

  // 1. 解析输入
  const scripts = parseScriptsInput(body)
  if (scripts.length === 0) {
    return NextResponse.json({ error: "请提供至少一条文案内容" }, { status: 400 })
  }
  const count = typeof body.count === "number" ? body.count : 1
  const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle : undefined
  const projectId = typeof body.projectId === "string" ? body.projectId : ""

  if (!projectId) {
    return NextResponse.json({ error: "请先选择一个项目，生成文案需要项目知识库" }, { status: 400 })
  }

  try {
    // 2. 阶段一：提取结构
    const extraction = await extractStructuresFromBatch(scripts)
    const record = await saveExtractedStructure({
      structure: extraction.structure,
      sourceScripts: scripts,
      userId: user.id,
      projectId,
    })

    // 3. 阶段二：基于结构生成文案
    const structure = blueprintToStructure(record)
    const result = await generateScriptsFromStructure({
      structure,
      count,
      userId: user.id,
      projectId,
      topicTitle,
    })

    // 4. 持久化生成的文案
    const saved = await saveGeneratedScripts({
      scripts: result.scripts,
      userId: user.id,
      structureId: record.id,
      projectId,
    })

    return NextResponse.json({
      data: {
        structure: record,
        analyses: extraction.analyses,
        scripts: saved,
        knowledgeSummary: result.knowledgeSummary,
        model: result.model,
      },
    })
  } catch (error) {
    if (isBatchTooLargeError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : "一键生成失败"
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
