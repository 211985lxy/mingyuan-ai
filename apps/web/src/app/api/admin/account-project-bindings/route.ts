import { parseJsonRecord } from "@/lib/api-contract"
import {
  AccountProjectContextError,
  bindAccountProject,
  deriveAccountProjectBindingStatus,
} from "@/lib/account-project-context"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"

function contextErrorResponse(error: unknown) {
  if (!(error instanceof AccountProjectContextError)) return null
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}

export const GET = withAdminOnly(async () => {
  const users = await prisma.user.findMany({
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      email: true,
      name: true,
      boundProjectId: true,
      projectBoundAt: true,
      projectBindingSource: true,
      clientProjects: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, status: true, updatedAt: true },
      },
    },
  })

  return NextResponse.json({
    data: users.map((user) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
      status: deriveAccountProjectBindingStatus({
        boundProjectId: user.boundProjectId,
        projects: user.clientProjects,
      }),
      boundProjectId: user.boundProjectId,
      projectBoundAt: user.projectBoundAt,
      projectBindingSource: user.projectBindingSource,
      projectCount: user.clientProjects.length,
      projects: user.clientProjects,
    })),
  })
})

export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  try {
    const body = await parseJsonRecord(request)
    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    if (!userId || !projectId) {
      return NextResponse.json({ error: "userId 与 projectId 必填" }, { status: 400 })
    }

    const project = await bindAccountProject({ userId, projectId, source: "admin_review" })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "account_project.bind",
      targetType: "user",
      targetId: userId,
      metadata: { projectId, source: "admin_review" },
    })

    return NextResponse.json(
      { status: "bound", project },
      { headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    return contextErrorResponse(error) ?? NextResponse.json(
      { error: "账号项目绑定失败" },
      { status: 500 },
    )
  }
})
