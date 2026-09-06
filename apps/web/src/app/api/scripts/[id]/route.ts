import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

const VALID_STATUSES = new Set(["draft", "candidate", "selected", "discarded"])

function contextErrorResponse(error: unknown) {
  if (!(error instanceof AccountProjectContextError)) return null
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}

export const PATCH = withUserAuth(async (request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  // 账号只允许操作其绑定项目的脚本；未绑定/需审核的账号直接被闸门拒绝。
  let projectId: string
  try {
    projectId = (await resolveBoundProject({ userId: user.id })).id
  } catch (error) {
    return contextErrorResponse(error) ?? NextResponse.json(
      { error: "账号项目配置不可用" },
      { status: 500 },
    )
  }

  const body = await parseJsonRecord(request)
  const content =
    typeof body.content === "string" ? body.content.trim() : undefined
  const status = typeof body.status === "string" ? body.status : undefined

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({ where: { id, userId: user.id, projectId } })
  if (!script) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (status === "selected" && script.generationRunId) {
      await tx.script.updateMany({
        where: {
          userId: user.id,
          projectId,
          generationRunId: script.generationRunId,
          status: "selected",
          NOT: { id: script.id },
        },
        data: {
          status: "candidate",
          selectedAt: null,
        },
      })
    }

    return tx.script.update({
      where: { id: script.id, userId: user.id, projectId },
      data: {
        content: content ?? script.content,
        status: status ?? script.status,
        selectedAt:
          status === "selected"
            ? new Date()
            : status
              ? null
              : script.selectedAt,
      },
    })
  })

  return NextResponse.json({ data: updated })
})
