import { NextRequest, NextResponse } from "next/server"

import { withAdminAuth } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { isValidAimAgent } from "@/lib/aim-harness/contracts"
import type { AimCustomSkill } from "@/generated/prisma/client"

/** PATCH /api/admin/aim/skills/[id] —— 更新自定义技能 */
export const PATCH = withAdminAuth(async (request: NextRequest, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })

  const body = await parseJsonRecord(request)
  const data: Partial<AimCustomSkill> = {}
  if (typeof body?.label === "string" && body.label.trim()) data.label = body.label.trim()
  if (typeof body?.description === "string") data.description = body.description
  if (typeof body?.prompt === "string" && body.prompt) data.prompt = body.prompt
  if (typeof body?.group === "string") data.group = body.group
  if (typeof body?.agentId === "string" && isValidAimAgent(body.agentId)) data.agentId = body.agentId
  if (typeof body?.skillId === "string" && body.skillId.trim()) data.skillId = body.skillId.trim()

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "没有可更新字段" }, { status: 400 })
  }

  const row = await prisma.aimCustomSkill.update({ where: { id }, data })
  return NextResponse.json({ data: toApiShape(row) })
})

/** DELETE /api/admin/aim/skills/[id] —— 删除自定义技能 */
export const DELETE = withAdminAuth(async (request: NextRequest, { params }) => {
  const id = params?.id
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })

  await prisma.aimCustomSkill.delete({ where: { id } })
  return NextResponse.json({ data: { id } })
})

function toApiShape(row: AimCustomSkill) {
  return {
    id: row.id,
    skillId: row.skillId,
    agentId: row.agentId,
    label: row.label,
    description: row.description,
    prompt: row.prompt,
    group: row.group,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
