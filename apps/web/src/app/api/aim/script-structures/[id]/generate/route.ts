import { NextResponse } from "next/server"

import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { withUserAuth } from "@/lib/user-auth"
import { generateScriptsFromStructure } from "@/lib/aim/script-structure-generator"
import {
  blueprintToStructure,
  getStructure,
  saveGeneratedScripts,
} from "@/lib/aim/script-structure-store"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

// ─── POST: 基于结构模板批量生成文案 ───────────────────────

export const POST = withUserAuth(async (request, { user, params }) => {
  const id = (await params)?.id
  if (!id) return NextResponse.json({ error: "缺少结构模板 ID" }, { status: 400 })

  // 1. 解析请求体并锁定当前账号绑定项目
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
  let projectId: string
  try {
    projectId = (await resolveBoundProject({
      userId: user.id,
      requestedProjectId: typeof body.projectId === "string" ? body.projectId : undefined,
    })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }

  // 2. 只加载当前绑定项目的结构模板，避免同一历史账号下的客户模板串用
  const record = await getStructure(id, user.id, projectId)
  if (!record) {
    return NextResponse.json({ error: "结构模板不存在" }, { status: 404 })
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
