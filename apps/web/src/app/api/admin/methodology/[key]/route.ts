import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import {
  METHODOLOGY_META,
  getMethodologyForAdmin,
  resetMethodologyToText,
  type MethodologyKey,
} from "@/lib/agent-methodology-store"

const VALID_KEYS = new Set<MethodologyKey>(
  Object.keys(METHODOLOGY_META) as MethodologyKey[]
)

function isValidKey(key: string): key is MethodologyKey {
  return VALID_KEYS.has(key as MethodologyKey)
}

/** GET /api/admin/methodology/[key] —— 单份方法论详情 */
export const GET = withAdminAuth(async (_request: NextRequest, { params }) => {
  const key = params?.key
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "key 非法" }, { status: 400 })
  }
  const item = await getMethodologyForAdmin(key)
  return NextResponse.json({ data: item })
})

/** POST /api/admin/methodology/[key] —— 重置为文件原文（删除 DB 覆盖） */
export const POST = withAdminAuth(async (request: NextRequest, { params }) => {
  const key = params?.key
  if (!key || !isValidKey(key)) {
    return NextResponse.json({ error: "key 非法" }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  if (body?.action !== "reset") {
    return NextResponse.json({ error: "仅支持 action=reset" }, { status: 400 })
  }

  await resetMethodologyToText(key)
  const item = await getMethodologyForAdmin(key)
  return NextResponse.json({ data: item })
})
