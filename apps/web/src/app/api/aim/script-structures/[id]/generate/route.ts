import { NextResponse } from "next/server"

import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { generateScriptsFromStructure } from "@/lib/aim/script-structure-generator"
import {
  blueprintToStructure,
  getStructure,
  saveGeneratedScripts,
} from "@/lib/aim/script-structure-store"

// ─── POST: 基于结构模板批量生成文案 ───────────────────────

export const POST = withUserAuth(async (request, { user, params }) => {
  const id = (await params)?.id
  if (!id) return NextResponse.json({ error: "缺少结构模板 ID" }, { status: 400 })

  // 1. 加载结构模板
  const record = await getStructure(id, user.id)
  if (!record) {
    return NextResponse.json({ error: "结构模板不存在" }, { status: 404 })
  }

  // 2. 解析请求体
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch (error) {
    const handled = apiRequestErrorResponse(request, error)
    if (handled) return handled
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 })
  }

  const count = typeof body.count === "number" ? body.count : 1
  const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle : undefined
  const projectId = typeof body.projectId === "string" ? body.projectId : ""

  if (!projectId) {
    return NextResponse.json({ error: "请先选择一个项目，生成文案需要项目知识库" }, { status: 400 })
  }

  // 3. 还原结构 + 调用生成器
  const structure = blueprintToStructure(record)
  try {
    const result = await generateScriptsFromStructure({
      structure,
      count,
      userId: user.id,
      projectId,
      topicTitle,
    })

    // 4. 持久化生成的文案到 Script 表
    const saved = await saveGeneratedScripts({
      scripts: result.scripts,
      userId: user.id,
      structureId: id,
      projectId,
    })

    return NextResponse.json({
      data: {
        scripts: saved,
        knowledgeSummary: result.knowledgeSummary,
        model: result.model,
        structureId: id,
        structureName: record.displayName,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "文案生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
