import { NextResponse } from "next/server"

import { withUserAuth } from "@/lib/user-auth"
import {
  deleteExtractedStructure,
  getStructure,
} from "@/lib/aim/script-structure-store"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

// ─── GET: 获取单个结构模板 ────────────────────────────────

export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = (await params)?.id
  if (!id) return NextResponse.json({ error: "缺少结构模板 ID" }, { status: 400 })
  let projectId: string
  try {
    projectId = (await resolveBoundProject({ userId: user.id })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
  const record = await getStructure(id, user.id, projectId)
  if (!record) {
    return NextResponse.json({ error: "结构模板不存在" }, { status: 404 })
  }
  return NextResponse.json({ data: record })
})

// ─── DELETE: 删除提取的结构模板（仅 origin=extracted 且归属当前用户） ──

export const DELETE = withUserAuth(async (_request, { user, params }) => {
  const id = (await params)?.id
  if (!id) return NextResponse.json({ error: "缺少结构模板 ID" }, { status: 400 })
  let projectId: string
  try {
    projectId = (await resolveBoundProject({ userId: user.id })).id
  } catch (error) {
    if (error instanceof AccountProjectContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
  const result = await deleteExtractedStructure(id, user.id, projectId)
  if (!result.ok) {
    return NextResponse.json({ error: "无法删除该结构模板" }, { status: 403 })
  }
  return NextResponse.json({ data: { ok: true } })
})
