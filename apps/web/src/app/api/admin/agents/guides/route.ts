import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { isValidAimAgent } from "@/lib/aim-ui-config"
import { listAgentGuides, setAgentGuideField, clearAgentGuideField } from "@/lib/agent-guide-store"

const ALLOWED_FIELDS = new Set([
  "intro",
  "placeholder",
  "primaryActionLabel",
  "quickPrompts",
  "scenarios",
  "outputAssets",
])

/** GET /api/admin/agents/guides —— 列出全部智能体文案（合并默认 + 覆盖） */
export const GET = withAdminOrEditor(async () => {
  const items = await listAgentGuides()
  return NextResponse.json({ data: items })
})

/** PUT /api/admin/agents/guides —— 更新单个字段覆盖 */
export const PUT = withAdminOrEditor(async (request: NextRequest, { admin }) => {
  const body = await parseJsonRecord(request)
  const { agentId, field, value } = body ?? {}

  if (!agentId || !isValidAimAgent(agentId)) {
    return NextResponse.json({ error: "agentId 非法" }, { status: 400 })
  }
  if (!field || !ALLOWED_FIELDS.has(field)) {
    return NextResponse.json(
      { error: `field 非法，允许：${[...ALLOWED_FIELDS].join(", ")}` },
      { status: 400 }
    )
  }

  // 数组字段序列化为 JSON
  let stored = value
  if (Array.isArray(value)) {
    if (!value.every((x: unknown) => typeof x === "string")) {
      return NextResponse.json({ error: "数组字段元素必须是字符串" }, { status: 400 })
    }
    stored = JSON.stringify(value)
  } else if (typeof value !== "string") {
    return NextResponse.json({ error: "value 必须是字符串或字符串数组" }, { status: 400 })
  }

  // 空值 → 清除覆盖，回退默认
  if (stored === "" || (Array.isArray(value) && value.length === 0)) {
    await clearAgentGuideField(agentId, field)
  } else {
    await setAgentGuideField(agentId, field, stored, admin.id)
  }

  return NextResponse.json({ data: { agentId, field, ok: true } })
})
