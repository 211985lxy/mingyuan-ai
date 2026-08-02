import { NextRequest, NextResponse } from "next/server"

import { withAdminAuth } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { isValidAimAgent } from "@/lib/aim-harness/contracts"
import type { AimCustomSkill } from "@/generated/prisma/client"

/** GET /api/admin/aim/skills?agentId=xxx —— 列出自定义技能（可按 agent 过滤） */
export const GET = withAdminAuth(async (request: NextRequest) => {
  const agentId = request.nextUrl.searchParams.get("agentId") || undefined
  const where = agentId ? { agentId } : {}
  const rows = await prisma.aimCustomSkill.findMany({
    where,
    orderBy: [{ agentId: "asc" }, { createdAt: "asc" }],
    take: 200,
  })
  return NextResponse.json({ data: rows.map(toApiShape) })
})

/** POST /api/admin/aim/skills —— 新建自定义技能 */
export const POST = withAdminAuth(async (request: NextRequest) => {
  const body = await parseJsonRecord(request)
  const parsed = parseSkillInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const existing = await prisma.aimCustomSkill.findUnique({
    where: { agentId_skillId: { agentId: parsed.value.agentId, skillId: parsed.value.skillId } },
  })
  if (existing) {
    return NextResponse.json(
      { error: `技能 ${parsed.value.skillId} 在 ${parsed.value.agentId} 下已存在` },
      { status: 409 },
    )
  }

  const row = await prisma.aimCustomSkill.create({ data: parsed.value })
  return NextResponse.json({ data: toApiShape(row) }, { status: 201 })
})

interface SkillInput {
  skillId: string
  agentId: string
  label: string
  description: string
  prompt: string
  group: string
}

function parseSkillInput(body: Record<string, unknown> | null):
  | { ok: true; value: SkillInput }
  | { ok: false; error: string } {
  if (!body) return { ok: false, error: "请求体为空" }
  const skillId = typeof body.skillId === "string" ? body.skillId.trim() : ""
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : ""
  const label = typeof body.label === "string" ? body.label.trim() : ""
  const prompt = typeof body.prompt === "string" ? body.prompt : ""
  const description = typeof body.description === "string" ? body.description : ""
  const group = typeof body.group === "string" ? body.group : ""

  if (!skillId) return { ok: false, error: "skillId 必填" }
  if (!agentId || !isValidAimAgent(agentId)) return { ok: false, error: "agentId 非法" }
  if (!label) return { ok: false, error: "label 必填" }
  if (!prompt) return { ok: false, error: "prompt 必填" }

  return { ok: true, value: { skillId, agentId, label, description, prompt, group } }
}

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
