import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import {
  METHODOLOGY_META,
  listMethodologiesForAdmin,
  updateMethodologyContent,
  type MethodologyKey,
} from "@/lib/agent-methodology-store"

const VALID_KEYS = new Set<MethodologyKey>(
  Object.keys(METHODOLOGY_META) as MethodologyKey[]
)

/** GET /api/admin/methodology —— 列出全部方法论（含内容、来源、更新时间） */
export const GET = withAdminAuth(async () => {
  const items = await listMethodologiesForAdmin()
  return NextResponse.json({ data: items })
})

/** PUT /api/admin/methodology —— 更新某份方法论内容（写 DB + 失效缓存） */
export const PUT = withAdminAuth(async (request: NextRequest, { admin }) => {
  const body = await parseJsonRecord(request)
  const key = body?.key as string
  const content = body?.content as string

  if (!key || !VALID_KEYS.has(key as MethodologyKey)) {
    return NextResponse.json(
      { error: "key 非法，应为 ip_copywriting / business_diagnosis / event_storytelling" },
      { status: 400 }
    )
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content 必须是字符串" }, { status: 400 })
  }

  const row = await updateMethodologyContent(key as MethodologyKey, content, admin.id)
  return NextResponse.json({
    data: {
      key: row.key,
      title: row.title,
      source: "db",
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    },
  })
})
