import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

/** GET /api/aim/skills?agentId=xxx —— 列出自定义技能（工作台前端用，公开读取）。
 *  增删改走 /api/admin/aim/skills（需 admin 鉴权）。 */
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId") || undefined
  const where = agentId ? { agentId } : {}
  const rows = await prisma.aimCustomSkill.findMany({
    where,
    orderBy: [{ agentId: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json({
    data: rows.map((row) => ({
      id: row.id,
      skillId: row.skillId,
      agentId: row.agentId,
      label: row.label,
      description: row.description,
      prompt: row.prompt,
      group: row.group,
      isCustom: true,
    })),
  })
}
