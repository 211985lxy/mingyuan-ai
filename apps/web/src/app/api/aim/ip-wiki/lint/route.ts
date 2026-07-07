import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { runIpWikiLint } from "@/lib/ip-wiki/lint"

export const maxDuration = 30

async function ensureProject(userId: string, projectId: string) {
  return prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  })
}

/** GET /api/aim/ip-wiki/lint?projectId=... —— 对某 IP 全案的维基页跑体检 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? ""
    if (!projectId) {
      return NextResponse.json({ error: "projectId 必填" }, { status: 400 })
    }
    const project = await ensureProject(user.id, projectId)
    if (!project) {
      return NextResponse.json({ error: "IP营销全案不存在或已归档" }, { status: 404 })
    }

    const report = await runIpWikiLint({ projectId })
    return NextResponse.json({ report })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/ip-wiki/lint GET] Error:", error)
    return NextResponse.json({ error: "维基体检失败" }, { status: 500 })
  }
}
